import { describe, expect, it, vi } from 'vitest';
import { SyntheticSchedulerService } from '../src/modules/synthetic-monitoring/synthetic-scheduler.service';

const monitor = { id: 'sym_1', projectId: 'proj_1', baseUrl: 'https://example.com' };

function makeScheduler(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const service = {
    claimDueMonitors: vi.fn(async () => [monitor]),
    createQueuedRun: vi.fn(async (_m: unknown, runId: string, trigger: string) => {
      calls.push(`queue:${trigger}:${runId}`);
    }),
    executeRunPipeline: vi.fn(async (_m: unknown, runId: string, trigger: string) => {
      calls.push(`run:${trigger}:${runId}`);
    }),
    ...overrides
  };
  return { scheduler: new SyntheticSchedulerService(service as never), service, calls };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe('SyntheticSchedulerService.evaluateDueMonitors', () => {
  it('inserts a queued run before starting the pipeline for each due monitor', async () => {
    const { scheduler, service, calls } = makeScheduler();

    await scheduler.evaluateDueMonitors();
    await flush();

    expect(service.createQueuedRun).toHaveBeenCalledWith(monitor, expect.stringMatching(/^srun_/), 'scheduled');
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatch(/^queue:scheduled:srun_/);
    // Same run id for the row and the pipeline, row first.
    expect(calls[1]).toBe(calls[0].replace('queue:', 'run:'));
  });

  it('skips the run when the queued row cannot be created', async () => {
    const { scheduler, service } = makeScheduler({
      createQueuedRun: vi.fn(async () => {
        throw new Error('db down');
      })
    });

    await scheduler.evaluateDueMonitors();
    await flush();

    expect(service.executeRunPipeline).not.toHaveBeenCalled();
  });
});
