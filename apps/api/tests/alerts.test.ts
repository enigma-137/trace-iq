import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlertsService } from '../src/modules/alerts/alerts.service';
import { affected, mockDatabase, rows, type MockDb } from './helpers/mock-db';

type AlertRow = {
  [column: string]: unknown;
  id: string;
  project_id: string;
  name: string;
  event_name: string;
  measure: string;
  property: string | null;
  filters: unknown[];
  window_hours: number;
  condition: string;
  threshold: number;
  webhook_url: string | null;
  email_recipients: string[] | null;
  notification_group_ids: string[] | null;
  enabled: boolean;
  last_status: string;
  last_value: number | null;
  last_evaluated_at: string | null;
  organization_id?: string;
};

function makeAlert(overrides: Partial<AlertRow> = {}): AlertRow {
  return {
    id: 'alt_1',
    project_id: 'proj_1',
    name: 'Signups',
    event_name: 'signup',
    measure: 'count',
    property: null,
    filters: [],
    window_hours: 24,
    condition: 'above',
    threshold: 100,
    webhook_url: null,
    email_recipients: ['ops@b.co'],
    notification_group_ids: [],
    enabled: true,
    last_status: 'ok',
    last_value: null,
    last_evaluated_at: null,
    organization_id: 'org_1',
    ...overrides
  };
}

interface Harness {
  db: MockDb;
  email: { send: ReturnType<typeof vi.fn> };
  groups: { resolveMembers: ReturnType<typeof vi.fn> };
  entitlements: { assertAlertsAvailable: ReturnType<typeof vi.fn>; getSnapshot: ReturnType<typeof vi.fn> };
  service: AlertsService;
}

// `values` is returned in order for consecutive metric queries (used for
// drops/spikes, which compute current then previous).
function makeService(metricValues: number[]): Harness {
  const db = mockDatabase((text) => {
    if (text.includes('FROM events')) {
      const value = metricValues.shift() ?? 0;
      return rows([{ value }]);
    }
    return affected(1);
  });
  const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
  const groups = { resolveMembers: vi.fn().mockResolvedValue([]) };
  const projects = { resolveActiveProject: vi.fn(), requireActiveProject: vi.fn() };
  const entitlements = {
    assertAlertsAvailable: vi.fn().mockResolvedValue(undefined),
    getSnapshot: vi.fn().mockResolvedValue({ plan: 'pro', features: { alerts: true } })
  };
  const service = new AlertsService(
    db as never,
    projects as never,
    groups as never,
    email as never,
    entitlements as never
  );
  return { db, email, groups, entitlements, service };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AlertsService.evaluateAlert (no persist/notify)', () => {
  it('triggers when the current value is above the threshold', async () => {
    const { service } = makeService([150]);
    const result = await service.evaluateAlert(makeAlert(), { persist: false, notify: false });
    expect(result.triggered).toBe(true);
    expect(result.status).toBe('triggered');
    expect(result.value).toBe(150);
  });

  it('reports ok when the value is below the threshold', async () => {
    const { service } = makeService([50]);
    const result = await service.evaluateAlert(makeAlert(), { persist: false, notify: false });
    expect(result.triggered).toBe(false);
    expect(result.status).toBe('ok');
  });

  it('triggers a below condition when the value drops under the threshold', async () => {
    const { service } = makeService([50]);
    const result = await service.evaluateAlert(
      makeAlert({ condition: 'below', threshold: 100 }),
      { persist: false, notify: false }
    );
    expect(result.triggered).toBe(true);
  });

  it('triggers drops_by when the current period fell by >= threshold vs previous', async () => {
    const { service } = makeService([50, 100]); // current first, previous second
    const result = await service.evaluateAlert(
      makeAlert({ condition: 'drops_by', threshold: 40 }),
      { persist: false, notify: false }
    );
    expect(result.triggered).toBe(true);
    expect(result.message).toContain('dropped');
  });

  it('does not trigger drops_by when the drop is under threshold', async () => {
    const { service } = makeService([80, 100]);
    const result = await service.evaluateAlert(
      makeAlert({ condition: 'drops_by', threshold: 40 }),
      { persist: false, notify: false }
    );
    expect(result.triggered).toBe(false);
  });

  it('triggers spikes_by when the current period grew by >= threshold', async () => {
    const { service } = makeService([200, 100]);
    const result = await service.evaluateAlert(
      makeAlert({ condition: 'spikes_by', threshold: 50 }),
      { persist: false, notify: false }
    );
    expect(result.triggered).toBe(true);
  });
});

describe('AlertsService.evaluateAlert (persist + notify)', () => {
  it('records an alert event and delivers email + webhook on the edge into triggered', async () => {
    const { db, email, service } = makeService([150]);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200 })
    );
    const alert = makeAlert({ webhook_url: 'https://hooks.example.com/alert' });

    const result = await service.evaluateAlert(alert, { persist: true, notify: true });

    expect(result.triggered).toBe(true);
    expect(db.queryCalls(/INSERT INTO alert_events/)).toHaveLength(1);

    // Email: sent to the flattened recipients and recorded per recipient.
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send.mock.calls[0][0].to).toEqual(['ops@b.co']);
    const emailDeliveries = db.queryCalls(/INSERT INTO alert_deliveries/).filter((c) => c.values[3] === 'email');
    expect(emailDeliveries).toHaveLength(1);
    expect(emailDeliveries[0].values[5]).toBe('sent');

    // Webhook: POSTed with the alert payload and recorded.
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hooks.example.com/alert');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.alertId).toBe('alt_1');
    expect(body.value).toBe(150);
    // Slack (text) and Discord (content) incoming webhooks accept the payload as-is.
    expect(body.text).toMatch(/^TraceIQ alert: /);
    expect(body.content).toBe(body.text);
    const webhookDeliveries = db.queryCalls(/INSERT INTO alert_deliveries/).filter((c) => c.values[3] === 'webhook');
    expect(webhookDeliveries).toHaveLength(1);
    expect(webhookDeliveries[0].values[5]).toBe('sent');
  });

  it('records an email failure when the mailer reports failure', async () => {
    const db = mockDatabase((text) => (text.includes('FROM events') ? rows([{ value: 150 }]) : affected(1)));
    const email = { send: vi.fn().mockResolvedValue({ ok: false, failure: 'Resend 401' }) };
    const groups = { resolveMembers: vi.fn().mockResolvedValue([]) };
    const projects = { resolveActiveProject: vi.fn(), requireActiveProject: vi.fn() };
    const entitlements = { assertAlertsAvailable: vi.fn().mockResolvedValue(undefined) };
    const service = new AlertsService(db as never, projects as never, groups as never, email as never, entitlements as never);

    await service.evaluateAlert(makeAlert(), { persist: true, notify: true });

    const emailDeliveries = db.queryCalls(/INSERT INTO alert_deliveries/).filter((c) => c.values[3] === 'email');
    expect(emailDeliveries).toHaveLength(1);
    expect(emailDeliveries[0].values[5]).toBe('failed');
    expect(emailDeliveries[0].values[6]).toBe('Resend 401');
  });

  it('does not re-notify when the alert was already triggered', async () => {
    const { db, email, service } = makeService([150]);
    const alert = makeAlert({ last_status: 'triggered' });

    await service.evaluateAlert(alert, { persist: true, notify: true });

    expect(db.queryCalls(/INSERT INTO alert_events/)).toHaveLength(0);
    expect(email.send).not.toHaveBeenCalled();
  });

  it('re-resolves notification group members at firing time', async () => {
    const db = mockDatabase((text) => (text.includes('FROM events') ? rows([{ value: 150 }]) : affected(1)));
    const email = { send: vi.fn().mockResolvedValue({ ok: true }) };
    const groups = { resolveMembers: vi.fn().mockResolvedValue(['pager@b.co', 'ops@b.co']) };
    const projects = { resolveActiveProject: vi.fn(), requireActiveProject: vi.fn() };
    const entitlements = { assertAlertsAvailable: vi.fn().mockResolvedValue(undefined) };
    const service = new AlertsService(db as never, projects as never, groups as never, email as never, entitlements as never);

    const alert = makeAlert({
      email_recipients: ['ops@b.co'],
      notification_group_ids: ['grp_pager']
    });

    await service.evaluateAlert(alert, { persist: true, notify: true });

    expect(groups.resolveMembers).toHaveBeenCalledWith(['grp_pager'], 'proj_1');
    expect(email.send.mock.calls[0][0].to.sort()).toEqual(['ops@b.co', 'pager@b.co']);
  });

  it('suppresses evaluation and outbound delivery after a Cloud downgrade', async () => {
    const { db, email, entitlements, service } = makeService([150]);
    entitlements.assertAlertsAvailable.mockRejectedValue(new Error('Alerts are available on Pro.'));
    vi.stubGlobal('fetch', vi.fn());

    await expect(service.evaluateAlert(makeAlert({ webhook_url: 'https://hooks.example.com/alert' }), {
      persist: true, notify: true
    })).rejects.toThrow(/available on Pro/);

    expect(db.queryCalls(/FROM events|UPDATE alerts|INSERT INTO alert_events|INSERT INTO alert_deliveries/)).toHaveLength(0);
    expect(email.send).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rechecks entitlement immediately before managed email when downgrade races delivery', async () => {
    const { email, entitlements, service } = makeService([150]);
    entitlements.assertAlertsAvailable
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Alerts are available on Pro.'));

    await expect(service.evaluateAlert(makeAlert(), { persist: true, notify: true }))
      .rejects.toThrow(/available on Pro/);
    expect(email.send).not.toHaveBeenCalled();
  });
});

describe('AlertsService Cloud feature gates', () => {
  it('allows a Pro organization to create an alert normally', async () => {
    const db = mockDatabase(() => affected(1));
    const entitlements = { assertAlertsAvailable: vi.fn().mockResolvedValue(undefined) };
    const service = new AlertsService(
      db as never,
      { requireWritableProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }) } as never,
      { resolveMembers: vi.fn().mockResolvedValue([]) } as never,
      { send: vi.fn() } as never,
      entitlements as never
    );

    await expect(service.create({ id: 'usr_1' } as never, {
      projectId: 'proj_1', name: 'Signups', eventName: 'signup', measure: 'count', condition: 'above', threshold: 10,
      emailRecipients: ['ops@b.co']
    })).resolves.toMatchObject({ name: 'Signups' });
    expect(entitlements.assertAlertsAvailable).toHaveBeenCalledWith('org_1');
    expect(db.queryCalls(/INSERT INTO alerts/)).toHaveLength(1);
  });

  it('accepts a webhook-only alert and rejects an alert with no channel', async () => {
    const makeCreateService = () =>
      new AlertsService(
        mockDatabase(() => affected(1)) as never,
        { requireWritableProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }) } as never,
        { resolveMembers: vi.fn().mockResolvedValue([]) } as never,
        { send: vi.fn() } as never,
        { assertAlertsAvailable: vi.fn().mockResolvedValue(undefined) } as never
      );
    const base = { projectId: 'proj_1', name: 'Signups', eventName: 'signup', measure: 'count', condition: 'above', threshold: 10 };

    await expect(makeCreateService().create({ id: 'usr_1' } as never, { ...base, webhookUrl: 'https://hooks.example.com/alert' }))
      .resolves.toMatchObject({ name: 'Signups' });
    await expect(makeCreateService().create({ id: 'usr_1' } as never, base)).rejects.toThrow(/at least one notification channel/);
  });

  it('blocks creating and enabling alerts without Pro while still allowing disable', async () => {
    const db = mockDatabase(() => affected(1));
    const projects = {
      requireWritableProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }),
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' })
    };
    const entitlements = {
      assertAlertsAvailable: vi.fn().mockRejectedValue(new Error('Alerts are available on Pro.'))
    };
    const service = new AlertsService(
      db as never,
      projects as never,
      { resolveMembers: vi.fn().mockResolvedValue([]) } as never,
      { send: vi.fn() } as never,
      entitlements as never
    );

    await expect(service.create({ id: 'usr_1' } as never, {
      projectId: 'proj_1', name: 'Signups', eventName: 'signup', condition: 'above', threshold: 10
    })).rejects.toThrow(/available on Pro/);
    await expect(service.setEnabled({ id: 'usr_1' } as never, 'alt_1', true, 'proj_1')).rejects.toThrow(/available on Pro/);
    await expect(service.setEnabled({ id: 'usr_1' } as never, 'alt_1', false, 'proj_1')).resolves.toEqual({ id: 'alt_1', enabled: false });

    expect(db.queryCalls(/INSERT INTO alerts/)).toHaveLength(0);
    expect(db.queryCalls(/UPDATE alerts/)).toHaveLength(1);
  });

  it('keeps downgraded alert definitions but suppresses the background scheduler and managed email', async () => {
    const alert = makeAlert();
    const db = mockDatabase((text) => text.includes('SELECT a.*,p.organization_id')
      ? rows([{ ...alert, organization_id: 'org_1' }])
      : affected(1));
    const email = { send: vi.fn() };
    const entitlements = { assertAlertsAvailable: vi.fn().mockRejectedValue(new Error('Alerts are available on Pro.')) };
    const service = new AlertsService(
      db as never,
      {} as never,
      { resolveMembers: vi.fn() } as never,
      email as never,
      entitlements as never
    );

    await (service as unknown as { evaluateDueAlerts(): Promise<void> }).evaluateDueAlerts();

    expect(email.send).not.toHaveBeenCalled();
    expect(db.queryCalls(/DELETE FROM alerts|UPDATE alerts|INSERT INTO alert_events|INSERT INTO alert_deliveries/)).toHaveLength(0);
  });
});
