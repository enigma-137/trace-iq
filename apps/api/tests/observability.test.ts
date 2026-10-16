import { describe, expect, it, vi } from 'vitest';
import { ObservabilityService } from '../src/modules/observability/observability.service';
import { mockDatabase, rows } from './helpers/mock-db';
import { DashboardUser } from '../src/modules/auth/auth.service';
import { createHash } from 'node:crypto';

const dummyUser: DashboardUser = {
  id: 'usr_1',
  email: 'ops@traceiq.test'
};

const mockProject = {
  id: 'proj_1',
  name: 'Production App',
  slug: 'production-app',
  organizationId: 'org_1',
  organizationName: 'TraceIQ Team',
  role: 'owner'
};

describe('ObservabilityService', () => {
  it('retrieves logs with filters and redacts sensitive credentials', async () => {
    const rawLogs = [
      {
        id: 'log_1',
        projectId: 'proj_1',
        timestamp: '2026-09-23T10:00:00.000Z',
        level: 'info',
        source: 'api',
        service: 'traceiq-api',
        message: 'POST /v1/events -> 200',
        status: 'success',
        statusCode: 200,
        durationMs: 45,
        method: 'POST',
        route: '/v1/events',
        clientIp: '1.2.3.4',
        userAgent: 'Mozilla/5.0',
        traceId: 'trc_123',
        requestId: 'req_123',
        sessionId: 'sess_123',
        distinctId: 'user_123',
        actorUserId: null,
        provider: null,
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
        environment: 'production',
        metadata: {
          authorization: 'Bearer super_secret_jwt_token',
          apiKey: 'tiq_live_998877',
          safeField: 'normal-value'
        },
        errorDetails: null
      }
    ];

    const db = mockDatabase((query, values) => {
      expect(query).toContain('FROM observability_logs');
      expect(values[0]).toBe('proj_1');
      return rows(rawLogs);
    });

    const projectsMock = {
      resolveActiveProject: vi.fn().mockResolvedValue(mockProject)
    };

    const service = new ObservabilityService(db as never, projectsMock as never);
    const result = await service.getLogs(dummyUser, {
      projectId: 'proj_1',
      source: 'api',
      search: 'events'
    });

    expect(result.project?.id).toBe('proj_1');
    expect(result.logs.length).toBe(1);
    expect(result.logs[0].message).toBe('POST /v1/events -> 200');
    // Verify credential redaction
    expect(result.logs[0].metadata?.authorization).toBe('[REDACTED]');
    expect(result.logs[0].metadata?.apiKey).toBe('[REDACTED]');
    expect(result.logs[0].metadata?.safeField).toBe('normal-value');
  });

  it('accepts a single status or a comma-separated status list', async () => {
    const db = mockDatabase(() => rows([]));
    const projectsMock = { resolveActiveProject: vi.fn().mockResolvedValue(mockProject) };
    const service = new ObservabilityService(db as never, projectsMock as never);

    await service.getLogs(dummyUser, { projectId: 'proj_1', status: 'error' });
    await service.getLogs(dummyUser, { projectId: 'proj_1', status: 'Error, warning,error' });
    await service.getHistogram(dummyUser, { projectId: 'proj_1', status: 'error,warning' });

    const [single, list] = db.queryCalls(/FROM observability_logs/);
    expect(single.text).toContain('status = $4');
    expect(single.values).toContain('error');
    expect(list.text).toContain('status = ANY($4::text[])');
    expect(list.values).toContainEqual(['error', 'warning']);
    const histogram = db.queryCalls(/count\(\*\) FILTER/)[0];
    expect(histogram.text).toContain('status = ANY($4::text[])');
  });

  it('aggregates time-series histogram with summary metrics', async () => {
    const bucketRows = [
      {
        bucket_time: '2026-09-23T10:00:00.000Z',
        total: 10,
        success: 8,
        warning: 1,
        error: 1,
        avg_duration: 52
      }
    ];
    const summaryRows = [
      {
        total: 10,
        success: 8,
        warning: 1,
        error: 1,
        avg_duration: 52,
        p95_duration: 120
      }
    ];
    const sourceRows = [
      { source: 'api', count: 7 },
      { source: 'ai', count: 3 }
    ];

    const db = mockDatabase((query) => {
      if (query.includes('GROUP BY 1')) {
        return rows(bucketRows);
      }
      if (query.includes('GROUP BY source')) {
        return rows(sourceRows);
      }
      return rows(summaryRows);
    });

    const projectsMock = {
      resolveActiveProject: vi.fn().mockResolvedValue(mockProject)
    };

    const service = new ObservabilityService(db as never, projectsMock as never);
    const result = await service.getHistogram(dummyUser, {
      projectId: 'proj_1',
      from: '2026-09-23T09:00:00.000Z',
      to: '2026-09-23T10:00:00.000Z'
    });

    expect(result.buckets.length).toBe(1);
    expect(result.buckets[0].total).toBe(10);
    expect(result.summary.total).toBe(10);
    expect(result.summary.error).toBe(1);
    expect(result.summary.p95Duration).toBe(120);
    expect(result.sourceCounts.api).toBe(7);
    expect(result.sourceCounts.ai).toBe(3);
  });

  it('correlates trace waterfall across requests and sessions', async () => {
    const rootLog = {
      id: 'log_root',
      projectId: 'proj_1',
      timestamp: '2026-09-23T10:00:00.000Z',
      level: 'info' as const,
      source: 'api',
      service: 'traceiq-api',
      message: 'POST /v1/ai/generate -> 200',
      status: 'success' as const,
      traceId: 'trc_shared_123',
      requestId: 'req_root',
      sessionId: 'sess_user_1',
      metadata: null,
      errorDetails: null
    };

    const spanRows = [
      {
        id: 'log_root',
        timestamp: '2026-09-23T10:00:00.000Z',
        level: 'info',
        source: 'api',
        service: 'traceiq-api',
        operation: 'POST /v1/ai/generate',
        status: 'success',
        statusCode: 200,
        durationMs: 350,
        traceId: 'trc_shared_123',
        requestId: 'req_root',
        metadata: { client: 'web' }
      },
      {
        id: 'log_child',
        timestamp: '2026-09-23T10:00:00.100Z',
        level: 'info',
        source: 'ai',
        service: 'openai-gpt4o',
        operation: 'chat.completions',
        status: 'success',
        statusCode: 200,
        durationMs: 220,
        traceId: 'trc_shared_123',
        requestId: 'req_ai',
        metadata: { model: 'gpt-4o' }
      }
    ];

    const db = mockDatabase((query) => {
      if (/\bLIMIT 1\b/i.test(query)) {
        return rows([rootLog]);
      }
      return rows(spanRows);
    });

    const projectsMock = {
      resolveActiveProject: vi.fn().mockResolvedValue(mockProject)
    };

    const service = new ObservabilityService(db as never, projectsMock as never);
    const trace = await service.getTrace(dummyUser, 'log_root', 'proj_1');

    expect(trace.root?.id).toBe('log_root');
    expect(trace.spans.length).toBe(2);
    expect(trace.spans[0].operation).toBe('POST /v1/ai/generate');
    expect(trace.spans[1].source).toBe('ai');
    expect(trace.spans[1].offsetMs).toBe(100);
  });

  it('authenticates SDK log ingestion via write key hash', async () => {
    const rawKey = 'tiq_write_live_12345';
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const db = mockDatabase((query, values) => {
      if (query.includes('FROM project_write_keys')) {
        expect(values[0]).toBe(keyHash);
        return rows([{ project_id: 'proj_1' }]);
      }
      if (query.includes('INSERT INTO observability_logs')) {
        expect(values[1]).toBe('proj_1'); // project_id
        expect(values[6]).toBe('SDK initialized'); // message
        return rows([]);
      }
      return rows([]);
    });

    const projectsMock = {
      resolveActiveProject: vi.fn().mockResolvedValue(mockProject)
    };

    const service = new ObservabilityService(db as never, projectsMock as never);
    const result = await service.ingestLogFromSdk(
      {
        message: 'SDK initialized',
        level: 'info',
        source: 'sdk',
        service: 'browser-sdk'
      },
      rawKey
    );

    expect(result.ok).toBe(true);
    expect(result.id).toBeTruthy();
  });
});
