import { vi } from 'vitest';

export interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
}

export interface QueryCall {
  text: string;
  values: unknown[];
}

export interface MockDb {
  query: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  calls: QueryCall[];
  queryCalls: (matcher: string | RegExp) => QueryCall[];
}

type OnQuery = (text: string, values: unknown[]) => QueryResultLike | Promise<QueryResultLike>;

/**
 * A DatabaseService stand-in that records every query and lets tests route results
 * by matching the SQL text. Never touches a real database.
 */
export function mockDatabase(onQuery?: OnQuery): MockDb {
  const calls: QueryCall[] = [];
  const query = vi.fn(async (text: string, values: unknown[] = []): Promise<QueryResultLike> => {
    calls.push({ text, values });
    const result = onQuery ? await onQuery(text, values) : { rows: [], rowCount: 0 };
    return result;
  });
  const transaction = vi.fn(async <T>(callback: (client: { query: typeof query }) => Promise<T>): Promise<T> => {
    return callback({ query });
  });

  return {
    query,
    transaction,
    calls,
    queryCalls: (matcher: string | RegExp) =>
      calls.filter((c) => (matcher instanceof RegExp ? matcher.test(c.text) : c.text.includes(matcher)))
  };
}

export function rows<T>(list: T[]): QueryResultLike<T> {
  return { rows: list, rowCount: list.length };
}

export function empty(): QueryResultLike {
  return { rows: [], rowCount: 0 };
}

export function affected(rowCount: number): QueryResultLike {
  return { rows: [], rowCount };
}
