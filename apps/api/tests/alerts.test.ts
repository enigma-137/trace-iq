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
    ...overrides
  };
}

interface Harness {
  db: MockDb;
  email: { send: ReturnType<typeof vi.fn> };
  groups: { resolveMembers: ReturnType<typeof vi.fn> };
  service: AlertsService;
}

// `values` is returned in order for consecutive metric queries (used for
// drops/spikes, which compute current then previous).
function makeService(metricValues: number[], overrides: Partial<AlertRow> = {}): Harness {
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
  const service = new AlertsService(
    db as never,
    projects as never,
    groups as never,
    email as never
  );
  return { db, email, groups, service };
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
    const webhookDeliveries = db.queryCalls(/INSERT INTO alert_deliveries/).filter((c) => c.values[3] === 'webhook');
    expect(webhookDeliveries).toHaveLength(1);
    expect(webhookDeliveries[0].values[5]).toBe('sent');
  });

  it('records an email failure when the mailer reports failure', async () => {
    const db = mockDatabase((text) => (text.includes('FROM events') ? rows([{ value: 150 }]) : affected(1)));
    const email = { send: vi.fn().mockResolvedValue({ ok: false, failure: 'Resend 401' }) };
    const groups = { resolveMembers: vi.fn().mockResolvedValue([]) };
    const projects = { resolveActiveProject: vi.fn(), requireActiveProject: vi.fn() };
    const service = new AlertsService(db as never, projects as never, groups as never, email as never);

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
    const service = new AlertsService(db as never, projects as never, groups as never, email as never);

    const alert = makeAlert({
      email_recipients: ['ops@b.co'],
      notification_group_ids: ['grp_pager']
    });

    await service.evaluateAlert(alert, { persist: true, notify: true });

    expect(groups.resolveMembers).toHaveBeenCalledWith(['grp_pager'], 'proj_1');
    expect(email.send.mock.calls[0][0].to.sort()).toEqual(['ops@b.co', 'pager@b.co']);
  });
});
