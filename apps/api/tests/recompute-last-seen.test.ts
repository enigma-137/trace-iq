import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PASSIVE_EVENTS } from '../src/common/passive-events';
import { mockDatabase, rows } from './helpers/mock-db';

const require = createRequire(import.meta.url);
const script = require('../scripts/recompute-last-seen.js') as {
  PASSIVE_EVENTS: string[];
  parseArgs: (argv: string[]) => { apply: boolean; projects: string[]; help: boolean };
  recompute: (
    client: unknown,
    options: { apply?: boolean; projects?: string[]; log?: (line: string) => void }
  ) => Promise<{ changed: number; updated: number }>;
};

describe('recompute-last-seen script', () => {
  it('uses the same passive events as ingest and retention', () => {
    expect(script.PASSIVE_EVENTS).toEqual([...PASSIVE_EVENTS]);
  });

  it('is a dry run unless --apply is passed', () => {
    expect(script.parseArgs([])).toEqual({ apply: false, projects: [], help: false });
    expect(script.parseArgs(['--project', 'p1', '--project', 'p2', '--apply'])).toEqual({
      apply: true,
      projects: ['p1', 'p2'],
      help: false
    });
    expect(() => script.parseArgs(['--project'])).toThrow('--project needs a project id');
    expect(() => script.parseArgs(['--force'])).toThrow('Unknown argument');
  });

  it('never writes on a dry run, and writes only projects with changes on --apply', async () => {
    const summary = (changed: number) =>
      rows([{ users: 3, changed, active_before: 3, active_after: 1, online_before: 2, online_after: 0 }]);
    const db = mockDatabase((text, values) => {
      if (text.includes('SELECT id FROM projects')) return rows([{ id: 'p1' }, { id: 'p2' }]);
      if (text.includes('count(*) FILTER')) return summary(values[0] === 'p1' ? 2 : 0);
      return { rows: [], rowCount: 2 };
    });
    const log = () => undefined;

    await script.recompute(db, { log });
    expect(db.queryCalls('UPDATE users u')).toHaveLength(0);

    const totals = await script.recompute(db, { apply: true, log });
    const updates = db.queryCalls('UPDATE users u');
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual(['p1', [...PASSIVE_EVENTS]]);
    expect(totals).toMatchObject({ changed: 2, updated: 2 });
  });
});
