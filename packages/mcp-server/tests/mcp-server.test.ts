import { afterEach, describe, expect, it, vi } from 'vitest';
import { compactTimeline, shapeResponse, summarizeList } from '../src/shape.js';
import { tools } from '../src/tools.js';
import { InputSchema } from '../src/types.js';
import { validateArgs } from '../src/validate.js';

const schema: InputSchema = {
  type: 'object',
  properties: {
    projectId: { type: 'string' },
    days: { type: 'integer', default: 7 },
    interval: { type: 'string', enum: ['hour', 'day'] },
    events: { type: 'array', items: { type: 'string' } },
    verbose: { type: 'boolean' }
  },
  required: ['projectId'],
  additionalProperties: false
};

describe('validateArgs', () => {
  it('applies defaults and drops absent optional fields', () => {
    expect(validateArgs(schema, { projectId: 'proj_1' })).toEqual({ projectId: 'proj_1', days: 7 });
  });

  it('rejects missing required arguments', () => {
    expect(() => validateArgs(schema, {})).toThrow('Missing required argument "projectId".');
    expect(() => validateArgs(schema, { projectId: '' })).toThrow(/projectId/);
  });

  it('rejects unknown arguments when additionalProperties is false', () => {
    expect(() => validateArgs(schema, { projectId: 'p', extra: 1 })).toThrow('Unexpected argument(s): extra.');
  });

  it.each([
    [{ days: 1.5 }, 'must be an integer'],
    [{ days: '7' }, 'must be a number'],
    [{ interval: 'week' }, 'must be one of: hour, day'],
    [{ events: ['a', 2] }, 'must be an array of strings'],
    [{ verbose: 'yes' }, 'must be a boolean']
  ])('rejects %j', (args, message) => {
    expect(() => validateArgs(schema, { projectId: 'p', ...args })).toThrow(message);
  });

  it('treats a non-object payload as empty', () => {
    expect(() => validateArgs(schema, ['proj_1'])).toThrow(/projectId/);
  });
});

describe('shapeResponse', () => {
  it('truncates long arrays with a marker', () => {
    const shaped = shapeResponse([1, 2, 3, 4, 5], { maxItems: 2 });
    expect(shaped).toEqual([1, 2, { __truncated: 3 }]);
  });

  it('clips long strings', () => {
    expect(shapeResponse('abcdef', { maxStringLength: 3 })).toBe('abc…');
  });

  it('collapses objects nested past maxDepth', () => {
    expect(shapeResponse({ a: { b: { c: 1 } } }, { maxDepth: 2 })).toEqual({ a: { b: { '[collapsed]': true } } });
  });
});

describe('compactTimeline and summarizeList', () => {
  it('keeps only the event, time and requested scalar properties', () => {
    const timeline = compactTimeline(
      [{ eventName: 'purchase', occurredAt: '2026-10-01T00:00:00Z', properties: { amount: 5, cart: { items: 3 } } }],
      ['amount', 'cart']
    );
    expect(timeline).toEqual([{ event: 'purchase', at: '2026-10-01T00:00:00Z', properties: { amount: 5 } }]);
  });

  it('reports the true total when previewing a list', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ i }));
    expect(summarizeList(rows, 25)).toMatchObject({ total: 30, __truncated: 5 });
    expect(summarizeList(rows.slice(0, 3), 25)).toEqual({ total: 3, preview: rows.slice(0, 3) });
  });
});

describe('tool registry', () => {
  it('has unique tool names', () => {
    const names = tools.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it.each(tools.map((tool) => [tool.name, tool] as const))('%s has a consistent definition', (_name, tool) => {
    expect(tool.name).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(tool.description.length).toBeGreaterThan(0);
    expect(tool.requiredScopes.length).toBeGreaterThan(0);
    for (const key of tool.schema.required ?? []) {
      expect(tool.schema.properties, `required "${key}" is not a declared property`).toHaveProperty(key);
    }
  });
});

describe('get_analytics_overview', () => {
  const tool = tools.find((candidate) => candidate.name === 'get_analytics_overview')!;

  afterEach(() => vi.unstubAllGlobals());

  function stubApi() {
    const urls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ range: '24h', totals: { events: 3 } }), { status: 200 });
    }));
    return urls;
  }

  it('passes the requested range to the API', async () => {
    const urls = stubApi();
    await tool.handler(validateArgs(tool.schema, { projectId: 'proj_1', range: '24h' }));
    expect(new URL(urls[0]).searchParams.get('range')).toBe('24h');
    expect(new URL(urls[0]).searchParams.get('projectId')).toBe('proj_1');
  });

  it('defaults to the last 7 days and rejects other windows', async () => {
    const urls = stubApi();
    await tool.handler(validateArgs(tool.schema, {}));
    expect(new URL(urls[0]).searchParams.get('range')).toBe('7d');
    expect(() => validateArgs(tool.schema, { range: '90d' })).toThrow('must be one of: 24h, 7d, 30d');
  });
});
