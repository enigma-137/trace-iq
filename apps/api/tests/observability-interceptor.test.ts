import { describe, expect, it, vi } from 'vitest';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ObservabilityInterceptor, shouldRecordRequest } from '../src/common/interceptors/observability.interceptor';

function run(path: string, outcome: { status: number; error?: { status: number; message: string } }) {
  const recordLog = vi.fn().mockResolvedValue({ ok: true });
  const interceptor = new ObservabilityInterceptor({ recordLog } as never);
  const req = { method: 'POST', path, headers: {}, query: {}, body: { projectId: 'proj_1' } };
  const res = { statusCode: outcome.status, setHeader: vi.fn() };
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res })
  };
  const handler = { handle: () => (outcome.error ? throwError(() => outcome.error) : of({ ok: true })) };
  return { recordLog, result: lastValueFrom(interceptor.intercept(context as never, handler as never)) };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ObservabilityInterceptor', () => {
  it('only records failed SDK deliveries', () => {
    expect(shouldRecordRequest('/v1/events/batch', 401)).toBe(true);
    expect(shouldRecordRequest('/v1/flags/evaluate', 503)).toBe(true);
    expect(shouldRecordRequest('/v1/events/batch', 202)).toBe(false);
    expect(shouldRecordRequest('/v1/dashboard/requests', 500)).toBe(false);
    expect(shouldRecordRequest('/v1/setup', 404)).toBe(false);
    expect(shouldRecordRequest('/v1/eventsx', 400)).toBe(false);
  });

  it('never writes dashboard or successful ingest traffic into project logs', async () => {
    for (const [path, status] of [
      ['/v1/dashboard/overview', 200],
      ['/v1/setup', 200],
      ['/v1/events/batch', 202]
    ] as const) {
      const { recordLog, result } = run(path, { status });
      await result;
      await flush();
      expect(recordLog).not.toHaveBeenCalled();
    }
  });

  it('records a rejected SDK batch as an SDK delivery warning', async () => {
    const { recordLog, result } = run('/v1/events/batch', {
      status: 200,
      error: { status: 401, message: 'Invalid write key.' }
    });
    await expect(result).rejects.toMatchObject({ status: 401 });
    await flush();
    expect(recordLog).toHaveBeenCalledTimes(1);
    expect(recordLog.mock.calls[0][0]).toMatchObject({
      projectId: 'proj_1',
      level: 'warn',
      status: 'warning',
      source: 'sdk',
      service: 'traceiq-ingest',
      statusCode: 401,
      message: 'SDK delivery failed — POST /v1/events/batch -> 401: Invalid write key.'
    });
  });
});
