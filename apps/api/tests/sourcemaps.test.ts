import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { SourceMapsService } from '../src/modules/sourcemaps/sourcemaps.service';
import { ErrorsService } from '../src/modules/errors/errors.service';
import {
  cleanSourcePath,
  framePath,
  loadTraceMap,
  matchMapFile,
  parseFrameLine,
  symbolicateStack
} from '../src/modules/sourcemaps/symbolicate';
import { mockDatabase, rows } from './helpers/mock-db';

// Minified: function a(){throw new Error("boom")}function b(){a()}
// a → handleClick (src/App.tsx line 2), the call a() in b → line 5.
const MAP = JSON.stringify({
  version: 3,
  file: 'index-3f2a9c1b.js',
  names: ['handleClick'],
  sources: ['webpack://app/./src/App.tsx'],
  sourcesContent: ["export function handleClick() {\n  throw new Error('boom');\n}\nexport function render() {\n  handleClick();\n}\n"],
  mappings: 'AAAO,aACL,wBAEK,aACLA'
});

const STACK = [
  'Error: boom',
  '    at a (https://app.example.com/assets/index-3f2a9c1b.js:1:14)',
  '    at b (https://app.example.com/assets/index-3f2a9c1b.js:1:51)',
  '    at https://cdn.example.com/vendor.js:1:1'
].join('\n');

const project = { id: 'proj_1', name: 'App', slug: 'app', organizationId: 'org_1', organizationName: 'Acme', role: 'member' };
const user = { id: 'user_1', authMethod: 'pat', scopes: ['sourcemaps:write'] } as const;
const projects = {
  resolveActiveProject: async () => project,
  requireActiveProject: async () => project,
  requireWritableProject: async () => project
};

describe('symbolicate helpers', () => {
  it('parses V8 and Firefox frames and ignores other lines', () => {
    expect(parseFrameLine('    at handler (https://x.dev/a.js:10:5)')).toMatchObject({ format: 'v8', fn: 'handler', url: 'https://x.dev/a.js', line: 10, column: 5 });
    expect(parseFrameLine('    at https://x.dev/a.js:1:2')).toMatchObject({ format: 'v8', fn: '', url: 'https://x.dev/a.js' });
    expect(parseFrameLine('onClick@https://x.dev/a.js:3:4')).toMatchObject({ format: 'gecko', fn: 'onClick', line: 3, column: 4 });
    expect(parseFrameLine('Error: user@example.com failed')).toBeNull();
  });

  it('matches frame paths to uploaded files by suffix at a directory boundary', () => {
    const files = [{ file: 'index.js' }, { file: 'assets/index.js' }, { file: 'other/index.js' }];
    expect(framePath('https://app.dev/static/assets/index.js?v=2#x')).toBe('static/assets/index.js');
    expect(matchMapFile('static/assets/index.js', files)).toEqual({ file: 'assets/index.js' });
    expect(matchMapFile('myindex.js', files)).toBeNull();
    expect(cleanSourcePath('webpack://app/./src/App.tsx')).toBe('src/App.tsx');
    expect(cleanSourcePath('../../src/lib/x.ts')).toBe('src/lib/x.ts');
  });

  it('rejects things that are not source maps', () => {
    expect(() => loadTraceMap('{"version":3}')).toThrow(/mappings/);
    expect(() => loadTraceMap('not json')).toThrow();
  });

  it('rewrites mapped frames, names them from the calling frame and keeps the rest', async () => {
    const map = loadTraceMap(MAP);
    const result = await symbolicateStack(STACK, async (url) => (url.includes('/assets/') ? map : null));

    expect(result.stack.split('\n')).toEqual([
      'Error: boom',
      '    at handleClick (src/App.tsx:2:3)',
      '    at b (src/App.tsx:5:3)',
      '    at https://cdn.example.com/vendor.js:1:1'
    ]);
    expect(result.mappedFrames).toBe(2);
    expect(result.context).toMatchObject({ file: 'src/App.tsx', line: 2 });
    expect(result.context?.lines.find((l) => l.line === 2)?.code).toBe("  throw new Error('boom');");
  });
});

describe('SourceMapsService', () => {
  it('stores a valid map under its normalized file path', async () => {
    const db = mockDatabase((text) => {
      if (/count\(\*\)::int AS total/.test(text)) return rows([{ total: 0, present: null }]);
      if (/INSERT INTO source_maps/.test(text)) return rows([{ file: 'assets/index-3f2a9c1b.js', sizeBytes: MAP.length, updatedAt: 'now' }]);
      return rows([]);
    });
    const service = new SourceMapsService(db as never, projects as never);

    const result = await service.upload(user, { release: ' 1.4.2 ', file: './assets/index-3f2a9c1b.js' }, Buffer.from(MAP));

    const [insert] = db.queryCalls(/INSERT INTO source_maps/);
    expect(insert.values.slice(1, 4)).toEqual(['proj_1', '1.4.2', 'assets/index-3f2a9c1b.js']);
    expect(insert.text).toContain('ON CONFLICT (project_id, release, file) DO UPDATE');
    expect(result).toMatchObject({ release: '1.4.2', map: { file: 'assets/index-3f2a9c1b.js' } });
  });

  it('rejects missing fields, invalid maps and full releases', async () => {
    const service = new SourceMapsService(
      mockDatabase((text) => (/count\(\*\)/.test(text) ? rows([{ total: 2000, present: false }]) : rows([]))) as never,
      projects as never
    );
    await expect(service.upload(user, { file: 'a.js' }, Buffer.from(MAP))).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.upload(user, { release: '1', file: 'a.js' }, Buffer.from('{"version":3}'))).rejects.toThrow(/valid source map/);
    await expect(service.upload(user, { release: '1', file: 'a.js' }, Buffer.from(MAP))).rejects.toThrow(/at most 2000/);
  });

  it('symbolicates samples whose release has a matching map, once per map', async () => {
    const db = mockDatabase((text) => {
      if (/SELECT id, release, file/.test(text)) return rows([{ id: 'smap_1', release: '1.4.2', file: 'assets/index-3f2a9c1b.js', updatedAt: '2026-10-25T00:00:00Z' }]);
      if (/SELECT content FROM source_maps/.test(text)) return rows([{ content: MAP }]);
      return rows([]);
    });
    const service = new SourceMapsService(db as never, projects as never);

    const result = await service.symbolicate('proj_1', [
      { stack: STACK, release: '1.4.2' },
      { stack: STACK, release: '1.4.2' },
      { stack: STACK, release: '1.4.1' },
      { stack: null, release: '1.4.2' }
    ]);

    expect(result[0]?.stack).toContain('at handleClick (src/App.tsx:2:3)');
    expect(result[1]?.mappedFrames).toBe(2);
    expect(result[2]).toBeNull();
    expect(result[3]).toBeNull();
    expect(db.queryCalls(/SELECT content FROM source_maps/)).toHaveLength(1);
  });

  it('skips the lookup entirely when no sample has a release', async () => {
    const db = mockDatabase(() => rows([]));
    const service = new SourceMapsService(db as never, projects as never);
    await expect(service.symbolicate('proj_1', [{ stack: STACK, release: null }])).resolves.toEqual([null]);
    expect(db.calls).toHaveLength(0);
  });
});

describe('ErrorsService.getIssue with source maps', () => {
  it('attaches symbolicated stacks to samples', async () => {
    const db = mockDatabase((text) => {
      if (/ORDER BY e.occurred_at DESC LIMIT 1/.test(text)) return rows([{ id: 'fp_1', type: 'Error', message: 'boom' }]);
      if (/LIMIT 25/.test(text)) return rows([{ id: 'evt_1', stack: STACK, release: '1.4.2', occurredAt: '2026-10-25' }]);
      return rows([]);
    });
    const sourceMaps = { symbolicate: async () => [{ stack: 'mapped', mappedFrames: 1, context: null }] };
    const service = new ErrorsService(db as never, projects as never, sourceMaps as never);

    const detail = await service.getIssue({ id: 'user_1', authMethod: 'supabase' }, { id: 'fp_1' });

    expect(detail.samples[0]).toMatchObject({ id: 'evt_1', stack: STACK, symbolicated: { stack: 'mapped' } });
  });
});
