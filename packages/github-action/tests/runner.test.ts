import { describe, expect, it, vi } from 'vitest';
import {
  extractGitContext,
  formatMarkdownSummary,
  parseInputs,
  pollGroupProgress,
  runSyntheticAction,
  triggerCiRuns
} from '../src/runner.js';

describe('TraceIQ GitHub Action - Input Parsing & Git Context', () => {
  it('parses valid inputs and normalizes values', () => {
    const inputs = parseInputs({
      'INPUT_API-KEY': 'tiq_pat_secret_123',
      'INPUT_PROJECT-ID': 'prj_test_1',
      'INPUT_PREVIEW-URL': 'https://preview-deploy.vercel.app/',
      'INPUT_MONITORS': 'sym_signup, sym_checkout ,sym_login',
      'INPUT_TIMEOUT-SECONDS': '300',
      'INPUT_POLL-INTERVAL-SECONDS': '2'
    });

    expect(inputs.apiKey).toBe('tiq_pat_secret_123');
    expect(inputs.projectId).toBe('prj_test_1');
    expect(inputs.previewUrl).toBe('https://preview-deploy.vercel.app/');
    expect(inputs.monitors).toEqual(['sym_signup', 'sym_checkout', 'sym_login']);
    expect(inputs.timeoutSeconds).toBe(300);
    expect(inputs.pollIntervalSeconds).toBe(2);
    expect(inputs.apiUrl).toBe('https://api.traceiq.run');
  });

  it('throws descriptive error if required inputs are missing', () => {
    expect(() => parseInputs({ 'INPUT_PROJECT-ID': 'prj_1', 'INPUT_PREVIEW-URL': 'https://test.app' })).toThrow(
      '"api-key" is required'
    );
    expect(() => parseInputs({ 'INPUT_API-KEY': 'key', 'INPUT_PREVIEW-URL': 'https://test.app' })).toThrow(
      '"project-id" is required'
    );
    expect(() => parseInputs({ 'INPUT_API-KEY': 'key', 'INPUT_PROJECT-ID': 'prj_1' })).toThrow(
      '"preview-url" is required'
    );
    expect(() =>
      parseInputs({
        'INPUT_API-KEY': 'key',
        'INPUT_PROJECT-ID': 'prj_1',
        'INPUT_PREVIEW-URL': 'https://test.app',
        'INPUT_MONITORS': '   '
      })
    ).toThrow('"monitors" must contain at least one monitor ID');
  });

  it('extracts git repository, sha, branch, and pull request number', () => {
    const git = extractGitContext({
      GITHUB_REPOSITORY: 'acme/webapp',
      GITHUB_SHA: 'a1b2c3d4e5',
      GITHUB_REF: 'refs/pull/42/merge',
      GITHUB_HEAD_REF: 'feature/signup-v2'
    });

    expect(git.provider).toBe('github');
    expect(git.repository).toBe('acme/webapp');
    expect(git.commitSha).toBe('a1b2c3d4e5');
    expect(git.branch).toBe('feature/signup-v2');
    expect(git.pullRequest).toBe(42);
  });
});

describe('TraceIQ GitHub Action - API Interaction & Polling', () => {
  it('triggers CI run with preview URL override and git metadata', async () => {
    let sentBody: any;
    let sentHeaders: any;

    const mockFetch = vi.fn().mockImplementation(async (url: string, options: any) => {
      sentHeaders = options.headers;
      sentBody = JSON.parse(options.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          runGroupId: 'srg_group_123',
          status: 'queued',
          totalMonitors: 2
        })
      };
    });

    const inputs = parseInputs({
      'INPUT_API-KEY': 'tiq_pat_secret',
      'INPUT_PROJECT-ID': 'prj_test',
      'INPUT_PREVIEW-URL': 'https://pr-42.preview.traceiq.dev',
      'INPUT_MONITORS': 'sym_signup,sym_login'
    });

    const git = {
      repository: 'acme/webapp',
      commitSha: 'c0ffee',
      branch: 'feature/auth',
      pullRequest: 42
    };

    const res = await triggerCiRuns(inputs, git, mockFetch as any);

    expect(res.runGroupId).toBe('srg_group_123');
    expect(sentHeaders['Authorization']).toBe('Bearer tiq_pat_secret');
    expect(sentHeaders['x-traceiq-api-key']).toBe('tiq_pat_secret');
    expect(sentBody.projectId).toBe('prj_test');
    expect(sentBody.baseUrl).toBe('https://pr-42.preview.traceiq.dev');
    expect(sentBody.monitorIds).toEqual(['sym_signup', 'sym_login']);
    expect(sentBody.git.pullRequest).toBe(42);
    expect(sentBody.idempotencyKey).toContain('github:acme/webapp:42:c0ffee');
  });

  it('polls group status until all monitors complete', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            group: { id: 'srg_1', status: 'running', passedMonitors: 0, totalMonitors: 2 },
            runs: []
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          group: { id: 'srg_1', status: 'passed', passedMonitors: 2, totalMonitors: 2 },
          runs: [
            { monitorId: 'sym_signup', status: 'passed', durationMs: 1200 },
            { monitorId: 'sym_login', status: 'passed', durationMs: 950 }
          ]
        })
      };
    });

    const inputs = parseInputs({
      'INPUT_API-KEY': 'key',
      'INPUT_PROJECT-ID': 'prj_1',
      'INPUT_PREVIEW-URL': 'https://test.app',
      'INPUT_MONITORS': 'sym_signup'
    });

    const mockSleep = vi.fn().mockResolvedValue(undefined);
    const result = await pollGroupProgress('srg_1', inputs, mockFetch as any, mockSleep);

    expect(result.group.status).toBe('passed');
    expect(result.runs.length).toBe(2);
    expect(callCount).toBe(2);
  });

  it('times out when polling exceeds timeout duration', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        group: { id: 'srg_1', status: 'running' },
        runs: []
      })
    });

    const inputs = parseInputs({
      'INPUT_API-KEY': 'key',
      'INPUT_PROJECT-ID': 'prj_1',
      'INPUT_PREVIEW-URL': 'https://test.app',
      'INPUT_MONITORS': 'sym_signup',
      'INPUT_TIMEOUT-SECONDS': '1'
    });

    let elapsed = 0;
    const mockSleep = vi.fn().mockImplementation(async () => {
      elapsed += 2000;
      // advance time to trigger timeout immediately
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + elapsed);
    });

    await expect(pollGroupProgress('srg_1', inputs, mockFetch as any, mockSleep)).rejects.toThrow(
      'did not complete within the 10s CI timeout'
    );
  });
});

describe('TraceIQ GitHub Action - End-to-End Orchestration & Summary', () => {
  it('formats clean markdown table and diagnostic link', () => {
    const data = {
      group: {
        id: 'srg_123',
        status: 'failed',
        baseUrl: 'https://pr-42.preview.traceiq.dev',
        environment: 'preview',
        repository: 'acme/webapp',
        pullRequestNumber: 42,
        passedMonitors: 1,
        totalMonitors: 2
      },
      runs: [
        { monitorId: 'sym_signup', status: 'passed', durationMs: 1420 },
        {
          monitorId: 'sym_checkout',
          status: 'failed',
          durationMs: 890,
          failureReason: 'Assertion failed: Element [data-testid="pay-btn"] not visible'
        }
      ]
    };

    const markdown = formatMarkdownSummary(data, 'https://app.traceiq.ai');

    expect(markdown).toContain('## ❌ TraceIQ Synthetic Checks: Failed');
    expect(markdown).toContain('https://pr-42.preview.traceiq.dev');
    expect(markdown).toContain('1 / 2 journeys passed');
    expect(markdown).toContain('| `sym_signup` | ✅ Pass | 1420ms | — |');
    expect(markdown).toContain('| `sym_checkout` | ❌ Fail | 890ms | Assertion failed: Element [data-testid="pay-btn"] not visible |');
    expect(markdown).toContain('https://app.traceiq.ai/dashboard/synthetic-monitors');
  });

  it('runs complete action flow exiting code 0 on all passing monitors', async () => {
    const logs: string[] = [];
    let savedSummary = '';

    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/ci-runs/srg_pass')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            group: {
              id: 'srg_pass',
              status: 'passed',
              baseUrl: 'https://preview.app',
              environment: 'preview',
              passedMonitors: 2,
              failedMonitors: 0,
              totalMonitors: 2
            },
            runs: [
              { monitorId: 'sym_1', status: 'passed', durationMs: 500 },
              { monitorId: 'sym_2', status: 'passed', durationMs: 600 }
            ]
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          runGroupId: 'srg_pass',
          status: 'queued',
          totalMonitors: 2
        })
      };
    });

    const env = {
      'INPUT_API-KEY': 'tiq_pat_123',
      'INPUT_PROJECT-ID': 'prj_1',
      'INPUT_PREVIEW-URL': 'https://preview.app',
      'INPUT_MONITORS': 'sym_1,sym_2'
    };

    const result = await runSyntheticAction(env, {
      fetchFn: mockFetch as any,
      log: (m) => logs.push(m),
      setSummary: (m) => {
        savedSummary = m;
      }
    });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe('passed');
    expect(result.passedCount).toBe(2);
    expect(result.failedCount).toBe(0);
    expect(savedSummary).toContain('✅ TraceIQ Synthetic Checks: Passed');
  });

  it('runs complete action flow exiting code 1 on monitor failure', async () => {
    const mockFetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('/ci-runs/srg_fail')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            group: {
              id: 'srg_fail',
              status: 'failed',
              baseUrl: 'https://preview.app',
              environment: 'preview',
              passedMonitors: 1,
              failedMonitors: 1,
              totalMonitors: 2
            },
            runs: [
              { monitorId: 'sym_1', status: 'passed', durationMs: 500 },
              { monitorId: 'sym_2', status: 'failed', durationMs: 700, failureReason: 'Network error 500' }
            ]
          })
        };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          runGroupId: 'srg_fail',
          status: 'queued',
          totalMonitors: 2
        })
      };
    });

    const env = {
      'INPUT_API-KEY': 'tiq_pat_123',
      'INPUT_PROJECT-ID': 'prj_1',
      'INPUT_PREVIEW-URL': 'https://preview.app',
      'INPUT_MONITORS': 'sym_1,sym_2'
    };

    const result = await runSyntheticAction(env, {
      fetchFn: mockFetch as any,
      log: () => {}
    });

    expect(result.exitCode).toBe(1);
    expect(result.status).toBe('failed');
    expect(result.passedCount).toBe(1);
    expect(result.failedCount).toBe(1);
  });
});
