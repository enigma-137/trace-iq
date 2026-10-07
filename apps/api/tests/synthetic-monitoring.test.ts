import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { SyntheticMonitoringService } from '../src/modules/synthetic-monitoring/synthetic-monitoring.service';
import { SyntheticSsrfValidator } from '../src/modules/synthetic-monitoring/synthetic-ssrf-validator';
import { SyntheticCryptoService } from '../src/modules/synthetic-monitoring/synthetic-crypto.service';
import { ReplaySyntheticExtractorService } from '../src/modules/synthetic-monitoring/replay-synthetic-extractor.service';
import { mockDatabase, rows } from './helpers/mock-db';

const PROJECT = {
  id: 'proj_synthetic_1',
  name: 'TraceIQ Web',
  slug: 'traceiq-web',
  organizationId: 'org_1',
  organizationName: 'Acme',
  role: 'owner'
};

const USER = {
  id: 'usr_synthetic_owner',
  email: 'owner@traceiq.test',
  authMethod: 'supabase' as const
};

function makeService(dbQueries?: (sql: string, params?: any[]) => any) {
  const db = mockDatabase(dbQueries || (() => rows([])));
  const projects = {
    requireActiveProject: vi.fn().mockImplementation(async (_u, projId) => {
      if (projId && projId !== PROJECT.id) throw new NotFoundException('Project not found');
      return PROJECT;
    }),
    requireWritableProject: vi.fn().mockImplementation(async (_u, projId) => {
      if (projId && projId !== PROJECT.id) throw new NotFoundException('Project not found');
      return PROJECT;
    })
  };
  const runner = {
    execute: vi.fn().mockResolvedValue({
      status: 'passed',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 450,
      failedStepIndex: null,
      failureReason: null,
      finalUrl: 'https://app.traceiq.dev/dashboard',
      stepResults: [
        { stepIndex: 0, stepType: 'navigate', status: 'passed', durationMs: 250 },
        { stepIndex: 1, stepType: 'assert_visible', status: 'passed', durationMs: 200 }
      ],
      consoleLogs: [],
      networkRequests: [],
      httpErrors: [],
      screenshotArtifactId: null,
      screenshotBase64: null
    })
  };
  const observability = {
    recordLog: vi.fn().mockResolvedValue(undefined)
  };
  const crypto = new SyntheticCryptoService();
  const artifacts = {
    saveArtifact: vi.fn().mockResolvedValue({ id: 'art_123' }),
    getArtifact: vi.fn(),
    listRunArtifacts: vi.fn(),
    deleteRunArtifacts: vi.fn()
  };
  const replayExtractor = new ReplaySyntheticExtractorService();
  const replayService = {
    getEventsForExtraction: vi.fn().mockResolvedValue({
      replay: {
        id: 'rpl_extracted_1',
        sessionId: 'ses_ext_1',
        userId: null,
        anonymousId: 'anon_ext_1',
        startedAt: new Date().toISOString(),
        durationSeconds: 30,
        deviceInfo: { browser: 'Chrome', viewport: { width: 1280, height: 720 } }
      },
      events: [
        { type: 4, timestamp: 1000, data: { href: 'https://app.traceiq.dev/signup', width: 1280, height: 720 } },
        { type: 2, timestamp: 1005, data: { node: { id: 1, tagName: 'html', childNodes: [{ id: 2, tagName: 'body' }] } } }
      ]
    })
  };

  const service = new SyntheticMonitoringService(
    db as any,
    projects as any,
    runner as any,
    observability as any,
    crypto as any,
    artifacts as any,
    replayExtractor as any,
    replayService as any
  );

  return { service, db, projects, runner, observability, crypto, artifacts, replayExtractor, replayService };
}

describe('SyntheticMonitoring - Hardened SSRF & Protocol Security', () => {
  it('blocks cloud metadata IP 169.254.169.254', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://169.254.169.254/latest/meta-data')).toThrow(
      BadRequestException
    );
  });

  it('blocks IPv4 private and loopback networks (127.0.0.1, 10.0.0.0/8, 192.168.0.0/16)', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://127.0.0.1:80/status')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://10.0.0.1:80/admin')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://192.168.1.1/router')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://172.16.5.10/')).toThrow(BadRequestException);
  });

  it('blocks IPv6 loopback, link-local, and unique local addresses (::1, fe80::, fc00::)', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://[::1]/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://[fe80::1ff:fe23:4567:890a]/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://[fc00::1]/')).toThrow(BadRequestException);
  });

  it('blocks IPv4-mapped IPv6 addresses (::ffff:127.0.0.1, ::ffff:169.254.169.254)', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://[::ffff:127.0.0.1]/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://[::ffff:169.254.169.254]/')).toThrow(BadRequestException);
  });

  it('blocks decimal integer alternative IP representations (2130706433 = 127.0.0.1)', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://2130706433/')).toThrow(BadRequestException);
  });

  it('blocks URLs with embedded credentials and dangerous non-HTTP ports', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://admin:secret@example.com/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://example.com:22/')).toThrow(BadRequestException); // SSH
    expect(() => SyntheticSsrfValidator.validateUrl('http://example.com:6379/')).toThrow(BadRequestException); // Redis
    expect(() => SyntheticSsrfValidator.validateUrl('http://example.com:5432/')).toThrow(BadRequestException); // Postgres
  });

  it('blocks dangerous non-HTTP protocols (file, javascript, ftp)', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('file:///etc/passwd')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('ftp://ftp.example.com')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('javascript:alert(1)')).toThrow(BadRequestException);
  });

  it('blocks octal, hex-dotted, and shortened alternative IP representations (0177.0.0.1, 017700000001, 127.1, 0x7f.0.0.1, 012.0.0.1, 0300.0250.0.1)', () => {
    expect(() => SyntheticSsrfValidator.validateUrl('http://0177.0.0.1/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://017700000001/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://127.1/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://0x7f.0.0.1/')).toThrow(BadRequestException);
    expect(() => SyntheticSsrfValidator.validateUrl('http://012.0.0.1/')).toThrow(BadRequestException); // Octal 10.0.0.1
    expect(() => SyntheticSsrfValidator.validateUrl('http://0300.0250.0.1/')).toThrow(BadRequestException); // Octal 192.168.0.1
  });

  it('permits valid public HTTP and HTTPS destinations', () => {
    const res = SyntheticSsrfValidator.validateUrl('https://example.com/login?step=1');
    expect(res.origin).toBe('https://example.com');
  });
});

describe('SyntheticMonitoring - Secrets Encryption & Redaction', () => {
  const crypto = new SyntheticCryptoService();

  it('encrypts and decrypts secret values using AES-256-GCM', () => {
    const plaintext = 'SuperSecretToken_12345!';
    const { encryptedValue, iv, tag } = crypto.encrypt(plaintext);

    expect(encryptedValue).not.toBe(plaintext);
    const decrypted = crypto.decrypt(encryptedValue, iv, tag);
    expect(decrypted).toBe(plaintext);
  });

  it('interpolates {{SECRET}} variables into template strings', () => {
    const template = 'https://example.com/login?email={{USER_EMAIL}}&pass={{USER_PASSWORD}}';
    const secrets = {
      USER_EMAIL: 'alice@example.com',
      USER_PASSWORD: 'MyPassword123'
    };

    const interpolated = crypto.interpolate(template, secrets);
    expect(interpolated).toBe('https://example.com/login?email=alice@example.com&pass=MyPassword123');
  });

  it('redacts configured secrets and common authorization tokens from logs', () => {
    const log = 'User logged in with MyPassword123 and Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test.token';
    const redacted = crypto.redact(log, ['MyPassword123']);

    expect(redacted).not.toContain('MyPassword123');
    expect(redacted).toContain('[REDACTED]');
    expect(redacted).toContain('[REDACTED_AUTH]');
  });
});

describe('SyntheticMonitoringService - Tenancy & CRUD', () => {
  it('enforces project isolation on monitor retrieval', async () => {
    const { service, projects } = makeService();
    projects.requireActiveProject.mockRejectedValueOnce(new NotFoundException('Project not found'));

    await expect(service.get(USER, 'sym_1', 'unauthorized_project')).rejects.toThrow(NotFoundException);
  });

  it('creates a synthetic monitor with validated steps', async () => {
    let insertedRow: any = null;
    const { service } = makeService((sql, params) => {
      if (sql.includes('INSERT INTO synthetic_monitors')) {
        insertedRow = {
          id: params?.[0],
          project_id: params?.[1],
          name: params?.[2],
          description: params?.[3],
          base_url: params?.[4],
          status: 'active',
          schedule: params?.[5],
          browser: params?.[6],
          viewport_width: params?.[7],
          viewport_height: params?.[8],
          timeout_ms: params?.[9],
          steps: JSON.parse(params?.[10] || '[]'),
          environment: params?.[11],
          created_by_user_id: params?.[13],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        return rows([insertedRow]);
      }
      return rows([]);
    });

    const result = await service.create(USER, {
      name: 'Critical Checkout Flow',
      baseUrl: 'https://example.com',
      schedule: '15m',
      browser: 'chromium',
      steps: [
        { type: 'navigate', url: '/checkout', description: 'Open checkout' },
        { type: 'click', selector: '[data-testid=pay-now]', description: 'Click Pay' }
      ]
    });

    expect(result.name).toBe('Critical Checkout Flow');
    expect(result.steps.length).toBe(2);
    expect(result.steps[0].type).toBe('navigate');
  });

  it('pauses and resumes a synthetic monitor', async () => {
    let currentStatus = 'active';
    const { service } = makeService((sql, params) => {
      if (sql.includes('FROM synthetic_monitors') && sql.includes('WHERE id = $1')) {
        return rows([
          {
            id: 'sym_1',
            projectId: PROJECT.id,
            name: 'Test',
            baseUrl: 'https://example.com',
            status: currentStatus,
            steps: [{ type: 'navigate', url: '/' }]
          }
        ]);
      }
      if (sql.includes('UPDATE synthetic_monitors')) {
        currentStatus = params?.[10];
        return rows([
          {
            id: 'sym_1',
            projectId: PROJECT.id,
            status: currentStatus
          }
        ]);
      }
      return rows([]);
    });

    const paused = await service.pause(USER, 'sym_1');
    expect(paused.status).toBe('paused');

    const resumed = await service.resume(USER, 'sym_1');
    expect(resumed.status).toBe('active');
  });
});

describe('SyntheticMonitoringService - Multi-Instance Claiming & Stale Recovery', () => {
  it('atomically claims due monitors with FOR UPDATE SKIP LOCKED lease', async () => {
    let updatedClaimedBy: string | null = null;
    const { service } = makeService((sql, params) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        return rows([{ id: 'sym_due_1' }, { id: 'sym_due_2' }]);
      }
      if (sql.includes('UPDATE synthetic_monitors') && sql.includes('claimed_by = $1')) {
        updatedClaimedBy = params?.[0];
        return rows([
          { id: 'sym_due_1', name: 'M1', claimed_by: updatedClaimedBy },
          { id: 'sym_due_2', name: 'M2', claimed_by: updatedClaimedBy }
        ]);
      }
      return rows([]);
    });

    const claimed = await service.claimDueMonitors('replica_node_1', 3);
    expect(claimed.length).toBe(2);
    expect(updatedClaimedBy).toBe('replica_node_1');
  });

  it('sweeps and times out stale runs left running after worker crash', async () => {
    let sweptCount = 0;
    const { service } = makeService((sql) => {
      if (sql.includes('UPDATE synthetic_runs') && sql.includes("status = 'timed_out'")) {
        sweptCount = 3;
        return { rows: [{ id: 'srun_1' }, { id: 'srun_2' }, { id: 'srun_3' }], rowCount: 3 };
      }
      return rows([]);
    });

    const count = await service.sweepStaleRuns();
    expect(count).toBe(3);
    expect(sweptCount).toBe(3);
  });

  it('triggers manual run asynchronously returning queued status immediately', async () => {
    let queuedRunId: string | null = null;
    const { service } = makeService((sql, params) => {
      if (sql.includes('FROM synthetic_monitors') && sql.includes('WHERE id = $1')) {
        return rows([
          {
            id: 'sym_manual_1',
            projectId: PROJECT.id,
            name: 'Manual Test Journey',
            baseUrl: 'https://example.com',
            status: 'active',
            schedule: '15m',
            browser: 'chromium',
            viewportWidth: 1280,
            viewportHeight: 720,
            timeoutMs: 30000,
            steps: [{ type: 'navigate', url: '/' }]
          }
        ]);
      }
      if (sql.includes('INSERT INTO synthetic_runs')) {
        queuedRunId = params?.[0];
        return rows([{ id: queuedRunId, status: 'queued' }]);
      }
      return rows([]);
    });

    const res = await service.triggerManualRun(USER, 'sym_manual_1');
    expect(res.status).toBe('queued');
    expect(res.runId).toBeDefined();
  });

  it('handles two scheduler instances competing for the same due monitor safely', async () => {
    // Simulate DB where first transaction locks row, second replica gets 0 rows due to SKIP LOCKED
    let firstClaimed = false;
    const { service: replica1 } = makeService((sql) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        firstClaimed = true;
        return rows([{ id: 'sym_due_1' }]);
      }
      if (sql.includes('UPDATE synthetic_monitors')) {
        return rows([{ id: 'sym_due_1', claimed_by: 'replica_1' }]);
      }
      return rows([]);
    });

    const { service: replica2 } = makeService((sql) => {
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        // Already locked by replica 1, so SKIP LOCKED returns 0 rows
        return rows([]);
      }
      return rows([]);
    });

    const claimed1 = await replica1.claimDueMonitors('replica_1', 1);
    const claimed2 = await replica2.claimDueMonitors('replica_2', 1);

    expect(claimed1.length).toBe(1);
    expect(claimed1[0].id).toBe('sym_due_1');
    expect(claimed2.length).toBe(0);
  });

  it('calculates next scheduled run timestamp accurately without thundering herds', () => {
    const { service } = makeService();
    const next15m = service.calculateNextRun('15m');
    const diffMs = next15m.getTime() - Date.now();
    // Should be approximately 15 minutes in the future (~900,000ms)
    expect(diffMs).toBeGreaterThanOrEqual(14 * 60 * 1000);
    expect(diffMs).toBeLessThanOrEqual(16 * 60 * 1000);
  });

  it('never exposes secret plaintext or encrypted ciphertexts in listSecrets', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('FROM synthetic_secrets')) {
        return rows([
          {
            id: 'sec_1',
            name: 'API_TOKEN',
            description: 'Staging API key',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
      }
      return rows([]);
    });

    const result = await service.listSecrets(USER, PROJECT.id);
    expect(result.secrets.length).toBe(1);
    expect(result.secrets[0].name).toBe('API_TOKEN');
    expect((result.secrets[0] as any).encrypted_value).toBeUndefined();
    expect((result.secrets[0] as any).value).toBeUndefined();
  });
});

describe('SyntheticMonitoring - Funnel Provenance & Integration', () => {
  it('persists source funnel metadata when creating a monitor converted from a funnel', async () => {
    let capturedValues: any[] = [];
    const { service } = makeService((sql, params) => {
      if (sql.includes('INSERT INTO synthetic_monitors')) {
        capturedValues = params || [];
        return rows([
          {
            id: 'sym_funnel_1',
            projectId: PROJECT.id,
            name: 'Signup Flow Monitor',
            description: 'Converted from Signup Funnel',
            baseUrl: 'https://example.com',
            browser: 'chromium',
            viewportWidth: 1280,
            viewportHeight: 720,
            status: 'active',
            schedule: '15m',
            nextRunAt: new Date().toISOString(),
            lastRunAt: null,
            lastRunStatus: null,
            lastRunDurationMs: null,
            steps: [{ type: 'navigate', url: '/signup' }],
            sourceType: 'funnel',
            sourceFunnelId: 'fnl_signup_123',
            sourceFunnelName: 'Signup Funnel',
            sourceFunnelUpdatedAt: '2026-01-01T00:00:00.000Z',
            sourceFunnelStepCount: 3,
            createdByUserId: USER.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
      }
      return rows([]);
    });

    const monitor = await service.create(USER, {
      name: 'Signup Flow Monitor',
      baseUrl: 'https://example.com',
      steps: [{ type: 'navigate', url: '/signup' }],
      sourceType: 'funnel',
      sourceFunnelId: 'fnl_signup_123',
      sourceFunnelName: 'Signup Funnel',
      sourceFunnelUpdatedAt: '2026-01-01T00:00:00.000Z',
      sourceFunnelStepCount: 3
    });

    expect(monitor.id).toBe('sym_funnel_1');
    expect(monitor.sourceType).toBe('funnel');
    expect(monitor.sourceFunnelId).toBe('fnl_signup_123');
    expect(monitor.sourceFunnelName).toBe('Signup Funnel');
    expect(monitor.sourceFunnelStepCount).toBe(3);

    // Verify values passed into query include source metadata
    expect(capturedValues).toContain('funnel');
    expect(capturedValues).toContain('fnl_signup_123');
    expect(capturedValues).toContain('Signup Funnel');
  });

  it('lists synthetic monitors linked to a specific funnel', async () => {
    const { service } = makeService((sql, params) => {
      if (sql.includes('source_funnel_id = $1')) {
        expect(params?.[0]).toBe('fnl_signup_123');
        return rows([
          {
            id: 'sym_funnel_1',
            projectId: PROJECT.id,
            name: 'Signup Flow Monitor',
            description: null,
            baseUrl: 'https://example.com',
            browser: 'chromium',
            viewportWidth: 1280,
            viewportHeight: 720,
            status: 'active',
            schedule: '15m',
            nextRunAt: new Date().toISOString(),
            lastRunAt: null,
            lastRunStatus: 'passed',
            lastRunDurationMs: 320,
            steps: [{ type: 'navigate', url: '/signup' }],
            sourceType: 'funnel',
            sourceFunnelId: 'fnl_signup_123',
            sourceFunnelName: 'Signup Funnel',
            sourceFunnelUpdatedAt: '2026-01-01T00:00:00.000Z',
            sourceFunnelStepCount: 3,
            createdByUserId: USER.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]);
      }
      return rows([]);
    });

    const result = await service.listByFunnel(USER, 'fnl_signup_123', PROJECT.id);
    expect(result.monitors).toHaveLength(1);
    expect(result.monitors[0].id).toBe('sym_funnel_1');
    expect(result.monitors[0].sourceFunnelId).toBe('fnl_signup_123');
  });
});

describe('SyntheticMonitoring - CI Run Groups & PR Preview Testing', () => {
  it('triggers CI run group overriding base URL and preserving git metadata', async () => {
    let capturedGroupInsert: any[] = [];
    let capturedRunInserts: any[][] = [];

    const { service } = makeService((sql, params) => {
      if (sql.includes('FROM synthetic_monitors') && sql.includes('WHERE id = ANY')) {
        return rows([
          {
            id: 'sym_signup',
            projectId: PROJECT.id,
            name: 'Signup Flow',
            baseUrl: 'https://app.traceiq.ai', // production URL
            browser: 'chromium',
            viewportWidth: 1280,
            viewportHeight: 720,
            timeoutMs: 30000,
            steps: [{ type: 'navigate', url: '/signup' }],
            status: 'active'
          },
          {
            id: 'sym_checkout',
            projectId: PROJECT.id,
            name: 'Checkout Flow',
            baseUrl: 'https://app.traceiq.ai', // production URL
            browser: 'chromium',
            viewportWidth: 1280,
            viewportHeight: 720,
            timeoutMs: 30000,
            steps: [{ type: 'navigate', url: '/checkout' }],
            status: 'active'
          }
        ]);
      }
      if (sql.includes('INSERT INTO synthetic_ci_run_groups')) {
        capturedGroupInsert = params || [];
        return rows([]);
      }
      if (sql.includes('INSERT INTO synthetic_runs')) {
        capturedRunInserts.push(params || []);
        return rows([]);
      }
      return rows([]);
    });

    const previewUrl = 'https://preview-pr-42.traceiq.dev';
    const result = await service.triggerCiRuns(
      { projectId: PROJECT.id },
      {
        projectId: PROJECT.id,
        monitorIds: ['sym_signup', 'sym_checkout'],
        baseUrl: previewUrl,
        environment: 'preview',
        git: {
          provider: 'github',
          repository: 'acme/webapp',
          commitSha: 'a1b2c3d4e5',
          branch: 'feature/auth-v2',
          pullRequest: 42
        },
        idempotencyKey: 'github:acme/webapp:42:a1b2c3:attempt-1'
      }
    );

    expect(result.runGroupId).toMatch(/^srg_/);
    expect(result.status).toBe('queued');
    expect(result.totalMonitors).toBe(2);
    expect(result.runs).toHaveLength(2);

    // Verify CI run group insertion parameters
    expect(capturedGroupInsert).toContain(previewUrl);
    expect(capturedGroupInsert).toContain('preview');
    expect(capturedGroupInsert).toContain('acme/webapp');
    expect(capturedGroupInsert).toContain('a1b2c3d4e5');
    expect(capturedGroupInsert).toContain(42);
    expect(capturedGroupInsert).toContain('github:acme/webapp:42:a1b2c3:attempt-1');

    // Verify individual run insertions use the preview URL override and link to runGroupId
    expect(capturedRunInserts).toHaveLength(2);
    expect(capturedRunInserts[0]).toContain(previewUrl);
    expect(capturedRunInserts[0]).toContain(result.runGroupId);
    expect(capturedRunInserts[0]).toContain('sym_signup');
    expect(capturedRunInserts[1]).toContain('sym_checkout');
  });

  it('enforces SSRF protection on the dynamic preview baseUrl override', async () => {
    const { service } = makeService();

    // Loopback IP
    await expect(
      service.triggerCiRuns(
        { projectId: PROJECT.id },
        {
          projectId: PROJECT.id,
          monitorIds: ['sym_signup'],
          baseUrl: 'http://127.0.0.1:3000'
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    // Cloud metadata IP
    await expect(
      service.triggerCiRuns(
        { projectId: PROJECT.id },
        {
          projectId: PROJECT.id,
          monitorIds: ['sym_signup'],
          baseUrl: 'http://169.254.169.254/latest/meta-data'
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);

    // Hex / Octal alternative IP
    await expect(
      service.triggerCiRuns(
        { projectId: PROJECT.id },
        {
          projectId: PROJECT.id,
          monitorIds: ['sym_signup'],
          baseUrl: 'http://0177.0.0.1/'
        }
      )
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces project isolation and rejects monitors belonging to other projects', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('FROM synthetic_monitors WHERE id = ANY')) {
        // Only returns 1 monitor out of 2 requested
        return rows([
          {
            id: 'sym_signup',
            projectId: PROJECT.id,
            name: 'Signup Flow'
          }
        ]);
      }
      return rows([]);
    });

    await expect(
      service.triggerCiRuns(
        { projectId: PROJECT.id },
        {
          projectId: PROJECT.id,
          monitorIds: ['sym_signup', 'sym_other_tenant_monitor'],
          baseUrl: 'https://preview.app.traceiq.dev'
        }
      )
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('handles idempotent retries safely returning existing group without duplicating runs', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('WHERE project_id = $1 AND idempotency_key = $2')) {
        return rows([
          {
            id: 'srg_existing_group',
            projectId: PROJECT.id,
            status: 'passed',
            baseUrl: 'https://preview.app.traceiq.dev',
            totalMonitors: 1,
            passedMonitors: 1,
            failedMonitors: 0,
            createdAt: new Date().toISOString()
          }
        ]);
      }
      if (sql.includes('WHERE sr.run_group_id = $1')) {
        return rows([
          {
            monitor_id: 'sym_signup',
            monitor_name: 'Signup Flow',
            id: 'srun_existing_1'
          }
        ]);
      }
      return rows([]);
    });

    const result = await service.triggerCiRuns(
      { projectId: PROJECT.id },
      {
        projectId: PROJECT.id,
        monitorIds: ['sym_signup'],
        baseUrl: 'https://preview.app.traceiq.dev',
        idempotencyKey: 'github:acme/web:pr-42:attempt-1'
      }
    );

    expect(result.runGroupId).toBe('srg_existing_group');
    expect(result.status).toBe('passed');
    expect(result.runs[0].runId).toBe('srun_existing_1');
  });

  it('retrieves detailed group status and runs for polling', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('FROM synthetic_ci_run_groups')) {
        return rows([
          {
            id: 'srg_detail_1',
            projectId: PROJECT.id,
            status: 'passed',
            baseUrl: 'https://preview.traceiq.dev',
            environment: 'preview',
            gitProvider: 'github',
            repository: 'acme/web',
            commitSha: 'c0ffee',
            branch: 'feat/test',
            pullRequestNumber: 10,
            idempotencyKey: null,
            totalMonitors: 1,
            passedMonitors: 1,
            failedMonitors: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            completedAt: new Date().toISOString()
          }
        ]);
      }
      if (sql.includes('FROM synthetic_runs')) {
        return rows([
          {
            id: 'srun_1',
            projectId: PROJECT.id,
            monitorId: 'sym_signup',
            status: 'passed',
            trigger: 'ci',
            targetUrl: 'https://preview.traceiq.dev',
            browser: 'chromium',
            durationMs: 1420,
            failedStepIndex: null,
            failureReason: null,
            stepResults: [],
            consoleLogs: [],
            networkRequests: [],
            httpErrors: [],
            runGroupId: 'srg_detail_1',
            createdAt: new Date().toISOString()
          }
        ]);
      }
      return rows([]);
    });

    const result = await service.getCiRunGroup({ projectId: PROJECT.id }, 'srg_detail_1');
    expect(result.group.id).toBe('srg_detail_1');
    expect(result.group.status).toBe('passed');
    expect(result.runs).toHaveLength(1);
    expect(result.runs[0].status).toBe('passed');
    expect(result.runs[0].durationMs).toBe(1420);
  });

  it('authenticates Personal Access Tokens and Project Write Keys', async () => {
    const { service } = makeService((sql) => {
      if (sql.includes('FROM personal_access_tokens pat')) {
        return rows([{ user_id: 'usr_pat_owner', project_id: PROJECT.id }]);
      }
      if (sql.includes('FROM project_write_keys pwk')) {
        return rows([{ project_id: PROJECT.id }]);
      }
      return rows([]);
    });

    // 1. PAT
    const patAuth = await service.authenticateCiCaller(
      'Bearer tiq_pat_valid_token_xyz',
      undefined,
      undefined,
      PROJECT.id
    );
    expect(patAuth.projectId).toBe(PROJECT.id);

    // 2. Project Write Key
    const writeKeyAuth = await service.authenticateCiCaller(
      undefined,
      'tiq_write_key_sample_123',
      undefined,
      PROJECT.id
    );
    expect(writeKeyAuth.projectId).toBe(PROJECT.id);
  });

  describe('Session Replay → Synthetic Journey Extraction & Provenance', () => {
    it('generates a draft from replay events and respects tenancy isolation', async () => {
      const { service, replayService } = makeService();

      const draft = await service.getReplayDraft(USER, 'rpl_extracted_1', PROJECT.id);

      expect(draft.source.type).toBe('replay');
      expect(draft.source.replayId).toBe('rpl_extracted_1');
      expect(draft.source.sessionId).toBe('ses_ext_1');
      expect(draft.monitor.baseUrl).toBe('https://app.traceiq.dev');
      expect(draft.initialSteps.length).toBeGreaterThanOrEqual(1);
      expect(draft.initialSteps[0].type).toBe('navigate');
      expect(replayService.getEventsForExtraction).toHaveBeenCalledWith(USER, 'rpl_extracted_1', PROJECT.id);
    });

    it('creates monitor with replay provenance fields intact', async () => {
      let insertedRow: any = null;
      const { service } = makeService((sql, params) => {
        if (sql.includes('INSERT INTO synthetic_monitors')) {
          insertedRow = {
            id: params?.[0],
            projectId: params?.[1],
            name: params?.[2],
            baseUrl: params?.[4],
            sourceType: params?.[13],
            sourceReplayId: params?.[18],
            sourceSessionId: params?.[19],
            sourceReplayStartedAt: params?.[20]?.toISOString?.() || params?.[20]
          };
          return rows([insertedRow]);
        }
        return rows([]);
      });

      const startedAt = '2026-10-07T10:00:00.000Z';
      const created = await service.create(USER, {
        name: 'Extracted Replay Monitor',
        baseUrl: 'https://app.traceiq.dev',
        steps: [{ type: 'navigate', url: '/signup' }],
        sourceType: 'replay',
        sourceReplayId: 'rpl_extracted_1',
        sourceSessionId: 'ses_ext_1',
        sourceReplayStartedAt: startedAt,
        projectId: PROJECT.id
      });

      expect(created.sourceType).toBe('replay');
      expect(created.sourceReplayId).toBe('rpl_extracted_1');
      expect(created.sourceSessionId).toBe('ses_ext_1');
    });
  });
});


