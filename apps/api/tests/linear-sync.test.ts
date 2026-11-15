import { ConflictException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinearAutoCreateService, meetsThreshold } from '../src/modules/integrations/linear/linear-auto-create.service';
import { LinearWebhookService, verifyLinearWebhook } from '../src/modules/integrations/linear/linear-webhook.service';
import { parseAutoCreate } from '../src/modules/integrations/linear/linear.service';
import { MockDb, empty, mockDatabase, rows } from './helpers/mock-db';

const SECRET = 'lin_wh_test_secret';

function sign(body: string, secret = SECRET) {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function delivery(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    action: 'update',
    type: 'Issue',
    organizationId: 'ws_1',
    createdAt: '2026-11-15T12:00:00.000Z',
    webhookTimestamp: Date.now(),
    data: { id: 'iss_1', identifier: 'ENG-123', updatedAt: '2026-11-15T12:00:00.000Z', state: { type: 'completed', name: 'Done' }, ...data },
    ...overrides
  };
}

describe('Linear webhook signature', () => {
  const body = JSON.stringify(delivery());

  it('accepts a correctly signed, fresh delivery', () => {
    expect(verifyLinearWebhook(SECRET, Buffer.from(body), sign(body))).toMatchObject({ type: 'Issue', data: { id: 'iss_1' } });
  });

  it('rejects a wrong, missing or malformed signature', () => {
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(body), sign(body, 'other-secret'))).toThrow(UnauthorizedException);
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(body), undefined)).toThrow(UnauthorizedException);
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(body), 'not-hex')).toThrow(UnauthorizedException);
    // A signature over different bytes (the body re-serialized or tampered with).
    const tampered = body.replace('"completed"', '"started"');
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(tampered), sign(body))).toThrow(/signature/);
  });

  it('rejects stale and future-dated deliveries', () => {
    const now = Date.now();
    const old = JSON.stringify(delivery({ webhookTimestamp: now - 61_000 }));
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(old), sign(old), now)).toThrow(/Stale/);
    const future = JSON.stringify(delivery({ webhookTimestamp: now + 61_000 }));
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(future), sign(future), now)).toThrow(/Stale/);
    const missing = JSON.stringify(delivery({ webhookTimestamp: undefined }));
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(missing), sign(missing), now)).toThrow(/Stale/);
    const recent = JSON.stringify(delivery({ webhookTimestamp: now - 30_000 }));
    expect(() => verifyLinearWebhook(SECRET, Buffer.from(recent), sign(recent), now)).not.toThrow();
  });

  it('refuses everything when no webhook secret is configured', () => {
    expect(() => verifyLinearWebhook('', Buffer.from(body), sign(body))).toThrow(ServiceUnavailableException);
  });
});

describe('Linear webhook sync', () => {
  let db: MockDb;
  let link: Record<string, unknown> | null;
  let errorStatus: string | null;
  let service: LinearWebhookService;

  beforeEach(() => {
    link = { projectId: 'proj_1', fingerprint: 'fp_1', workspaceId: 'ws_1', linearStateType: 'started', linearUpdatedAt: '2026-11-15T11:00:00.000Z' };
    errorStatus = 'open';
    db = mockDatabase((text) => {
      if (text.includes('FROM error_linear_issues WHERE linear_issue_id = $1 FOR UPDATE')) return link ? rows([link]) : empty();
      if (text.includes('INSERT INTO error_issues')) {
        if (errorStatus === 'ignored') return empty();
        errorStatus = 'resolved';
        return rows([{ '?column?': 1 }]);
      }
      if (text.includes("SET status = 'open'")) {
        if (errorStatus !== 'resolved') return empty();
        errorStatus = 'open';
        return rows([{ '?column?': 1 }]);
      }
      return empty();
    });
    service = new LinearWebhookService(db as never);
  });

  it('resolves the linked error when the Linear issue is completed or canceled, marked as from Linear', async () => {
    await expect(service.handle(delivery())).resolves.toBe('resolved');
    const resolve = db.queryCalls('INSERT INTO error_issues')[0];
    expect(resolve.values).toEqual(['proj_1', 'fp_1']);
    expect(resolve.text).toContain("status_source = 'linear'");
    expect(resolve.text).toContain("WHERE error_issues.status <> 'ignored'");
    expect(db.queryCalls('SET linear_state_type = $2')[0].values).toEqual(['iss_1', 'completed', '2026-11-15T12:00:00.000Z']);

    errorStatus = 'open';
    await expect(service.handle(delivery({}, { state: { type: 'canceled' }, updatedAt: '2026-11-15T13:00:00.000Z' }))).resolves.toBe('resolved');
  });

  it('reopens the error when the issue moves out of done', async () => {
    link = { ...link, linearStateType: 'completed' };
    errorStatus = 'resolved';
    await expect(service.handle(delivery({}, { state: { type: 'started' } }))).resolves.toBe('reopened');
    const reopen = db.queryCalls("SET status = 'open'")[0];
    expect(reopen.values).toEqual(['proj_1', 'fp_1']);
    expect(reopen.text).toContain("AND status = 'resolved'");
    expect(errorStatus).toBe('open');
  });

  it('is idempotent: a repeated or older delivery changes nothing', async () => {
    link = { ...link, linearStateType: 'completed', linearUpdatedAt: '2026-11-15T12:00:00.000Z' };
    await expect(service.handle(delivery())).resolves.toBe('stale');
    await expect(service.handle(delivery({}, { state: { type: 'started' }, updatedAt: '2026-11-15T11:30:00.000Z' }))).resolves.toBe('stale');
    expect(db.queryCalls('INSERT INTO error_issues')).toHaveLength(0);
    expect(db.queryCalls("SET status = 'open'")).toHaveLength(0);
    expect(db.queryCalls('SET linear_state_type')).toHaveLength(0);
  });

  it('does not resolve again when the issue stays done, or reopen when it was never done', async () => {
    link = { ...link, linearStateType: 'completed' };
    await expect(service.handle(delivery({}, { state: { type: 'canceled' } }))).resolves.toBe('recorded');
    link = { ...link, linearStateType: null, linearUpdatedAt: null };
    await expect(service.handle(delivery({}, { state: { type: 'started' } }))).resolves.toBe('recorded');
    expect(db.queryCalls('INSERT INTO error_issues')).toHaveLength(0);
    expect(db.queryCalls("SET status = 'open'")).toHaveLength(0);
  });

  it('leaves ignored errors ignored', async () => {
    errorStatus = 'ignored';
    await expect(service.handle(delivery())).resolves.toBe('recorded');
    expect(errorStatus).toBe('ignored');
  });

  it('ignores unlinked issues, other workspaces and other event types', async () => {
    link = null;
    await expect(service.handle(delivery())).resolves.toBe('unlinked');
    link = { projectId: 'proj_1', fingerprint: 'fp_1', workspaceId: 'ws_1', linearStateType: null, linearUpdatedAt: null };
    await expect(service.handle(delivery({ organizationId: 'ws_other' }))).resolves.toBe('workspace_mismatch');
    await expect(service.handle(delivery({ organizationId: undefined }))).resolves.toBe('workspace_mismatch');
    await expect(service.handle(delivery({ type: 'Comment' }))).resolves.toBe('ignored');
    await expect(service.handle(delivery({ action: 'remove' }))).resolves.toBe('ignored');
    await expect(service.handle(delivery({}, { state: null }))).resolves.toBe('ignored');
    expect(db.queryCalls('INSERT INTO error_issues')).toHaveLength(0);
    expect(db.queryCalls('SET linear_state_type')).toHaveLength(0);
  });
});

describe('LinearController webhook route', () => {
  afterEach(() => {
    delete process.env.LINEAR_WEBHOOK_SECRET;
  });

  it('verifies the raw body before handling it', async () => {
    process.env.LINEAR_WEBHOOK_SECRET = SECRET;
    const { LinearController } = await import('../src/modules/integrations/linear/linear.controller');
    const webhooks = new LinearWebhookService(mockDatabase() as never);
    const handle = vi.spyOn(webhooks, 'handle').mockResolvedValue('unlinked');
    const controller = new LinearController({} as never, {} as never, webhooks);
    const body = JSON.stringify(delivery());

    await expect(controller.webhook({ rawBody: Buffer.from(body) } as never, sign(body), 'dlv_1')).resolves.toEqual({ ok: true, outcome: 'unlinked' });
    await expect(controller.webhook({ rawBody: Buffer.from(body) } as never, sign(body, 'wrong'), 'dlv_2')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.webhook({} as never, sign(body), 'dlv_3')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(handle).toHaveBeenCalledTimes(1);
  });
});

describe('auto-create rule', () => {
  it('meets the threshold on occurrences OR affected users', () => {
    expect(meetsThreshold({ minOccurrences: 10, minUsers: null }, { occurrences: 10, users: 0 })).toBe(true);
    expect(meetsThreshold({ minOccurrences: 10, minUsers: null }, { occurrences: 9, users: 100 })).toBe(false);
    expect(meetsThreshold({ minOccurrences: null, minUsers: 3 }, { occurrences: 1, users: 3 })).toBe(true);
    expect(meetsThreshold({ minOccurrences: 100, minUsers: 5 }, { occurrences: 2, users: 5 })).toBe(true);
    expect(meetsThreshold({ minOccurrences: 100, minUsers: 5 }, { occurrences: 99, users: 4 })).toBe(false);
    expect(meetsThreshold({ minOccurrences: null, minUsers: null }, { occurrences: 1e6, users: 1e6 })).toBe(false);
  });

  it('validates the settings payload', () => {
    expect(parseAutoCreate({ enabled: true, minOccurrences: 50 })).toEqual({ enabled: true, minOccurrences: 50, minUsers: null });
    expect(parseAutoCreate({ enabled: true, minUsers: '5', minOccurrences: '' })).toEqual({ enabled: true, minOccurrences: null, minUsers: 5 });
    expect(parseAutoCreate({ enabled: false })).toEqual({ enabled: false, minOccurrences: null, minUsers: null });
    expect(() => parseAutoCreate({ enabled: true })).toThrow(/threshold/);
    expect(() => parseAutoCreate({ enabled: true, minOccurrences: 0 })).toThrow(/whole number/);
    expect(() => parseAutoCreate({ enabled: true, minOccurrences: 2.5 })).toThrow(/whole number/);
    expect(() => parseAutoCreate({ enabled: true, minUsers: 2_000_000 })).toThrow(/whole number/);
    expect(() => parseAutoCreate({ enabled: 'yes', minUsers: 1 })).toThrow(/enabled/);
    expect(() => parseAutoCreate(null)).toThrow(/object/);
  });
});

describe('LinearAutoCreateService', () => {
  let db: MockDb;
  let rule: Record<string, unknown> | null;
  let facts: { linked: boolean; status: string | null; occurrences: number; users: number };
  let issues: { createLinked: ReturnType<typeof vi.fn> };
  let service: LinearAutoCreateService;

  beforeEach(() => {
    rule = { organizationId: 'org_1', minOccurrences: 10, minUsers: null };
    facts = { linked: false, status: null, occurrences: 12, users: 2 };
    db = mockDatabase((text) => {
      if (text.includes('FROM linear_project_settings s')) return rule ? rows([rule]) : empty();
      if (text.includes('AS linked')) return rows([facts]);
      return empty();
    });
    issues = { createLinked: vi.fn().mockResolvedValue({ created: true, linearIssue: { identifier: 'ENG-1' } }) };
    service = new LinearAutoCreateService(db as never, issues as never);
  });

  it('creates an issue as the app (no user) once the threshold is met', async () => {
    await expect(service.evaluate('proj_1', 'fp_1')).resolves.toBe('created');
    expect(issues.createLinked).toHaveBeenCalledWith({ id: 'proj_1', organizationId: 'org_1' }, 'fp_1', { actorUserId: null, via: 'auto' });
    const ruleQuery = db.queryCalls('FROM linear_project_settings s')[0];
    expect(ruleQuery.text).toContain("c.status = 'active'");
    expect(ruleQuery.text).toContain('s.auto_create_linear_issues');
  });

  it('does nothing when the rule is off, the error is below threshold, already linked or ignored', async () => {
    facts = { ...facts, occurrences: 9 };
    await expect(service.evaluate('proj_1', 'fp_1')).resolves.toBe('below_threshold');
    facts = { ...facts, occurrences: 50, linked: true };
    await expect(service.evaluate('proj_1', 'fp_1')).resolves.toBe('linked');
    facts = { ...facts, linked: false, status: 'ignored' };
    await expect(service.evaluate('proj_1', 'fp_1')).resolves.toBe('ignored');
    rule = null;
    await expect(service.evaluate('proj_2', 'fp_1')).resolves.toBe('no_rule');
    expect(issues.createLinked).not.toHaveBeenCalled();
  });

  it('caches the rule so projects without auto-create cost one query per window', async () => {
    rule = null;
    await service.evaluate('proj_1', 'fp_1');
    await service.evaluate('proj_1', 'fp_2');
    expect(db.queryCalls('FROM linear_project_settings s')).toHaveLength(1);
    expect(db.queryCalls('AS linked')).toHaveLength(0);
  });

  it('treats another request creating the issue as done, not as a failure', async () => {
    issues.createLinked.mockRejectedValue(new ConflictException({ code: 'LINEAR_ISSUE_IN_PROGRESS', message: 'busy' }));
    await expect(service.evaluate('proj_1', 'fp_1')).resolves.toBe('existing');
  });

  it('checks each error once per batch and per minute, so a burst cannot create duplicates', async () => {
    service.onExceptionsIngested('proj_1', ['fp_1', 'fp_1', 'fp_1', undefined]);
    service.onExceptionsIngested('proj_1', ['fp_1']);
    await service.settle();
    expect(issues.createLinked).toHaveBeenCalledTimes(1);
    expect(db.queryCalls('AS linked')).toHaveLength(1);
  });

  it('checks again on the next occurrence while still below the threshold', async () => {
    facts = { ...facts, occurrences: 3 };
    service.onExceptionsIngested('proj_1', ['fp_1']);
    await service.settle();
    facts = { ...facts, occurrences: 10 };
    service.onExceptionsIngested('proj_1', ['fp_1']);
    await service.settle();
    expect(issues.createLinked).toHaveBeenCalledTimes(1);
  });

  it('never throws into ingestion and never waits on Linear', async () => {
    const warn = vi.spyOn((service as unknown as { logger: { warn: (m: string) => void } }).logger, 'warn').mockImplementation(() => undefined);
    let finishLinear!: () => void;
    issues.createLinked.mockImplementation(() => new Promise((resolve) => (finishLinear = () => resolve({ created: true }))));
    // Returns synchronously even though Linear has not answered.
    expect(service.onExceptionsIngested('proj_1', ['fp_1'])).toBeUndefined();
    await vi.waitFor(() => expect(issues.createLinked).toHaveBeenCalled());
    finishLinear();
    await service.settle();

    db.query.mockRejectedValue(new Error('database down'));
    expect(() => service.onExceptionsIngested('proj_9', ['fp_9'])).not.toThrow();
    await expect(service.settle()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Linear auto-create failed'));

    expect(() => service.onExceptionsIngested(undefined, ['fp_1'])).not.toThrow();
  });
});

describe('ingestion hook', () => {
  it('passes exception fingerprints to auto-create after the write, and ignores other events', () => {
    const source = readEventsSource();
    expect(source).toContain('this.linearAutoCreate?.onExceptionsIngested(');
    expect(source).toContain("prepared.filter((p) => p.eventName === EXCEPTION_EVENT).map((p) => exceptionFingerprint(p.properties))");
    expect(source).toContain('if (eventName === EXCEPTION_EVENT) {');
    expect(source).toContain('@Optional() private readonly linearAutoCreate?: LinearAutoCreateService');
  });
});

function readEventsSource() {
  return readFileSync(new URL('../src/modules/events/events.service.ts', import.meta.url), 'utf8');
}
