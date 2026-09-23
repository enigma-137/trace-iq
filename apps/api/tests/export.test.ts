import { describe, expect, it, vi } from 'vitest';
import { ExportService } from '../src/modules/export/export.service';
import { mockDatabase, rows } from './helpers/mock-db';
import { DashboardUser } from '../src/modules/auth/auth.service';

const dummyUser: DashboardUser = {
  id: 'usr_1',
  email: 'founder@example.com',
  organizationId: 'org_1',
  organizationRole: 'owner',
  projectIds: ['proj_1'],
  scopes: ['exports:read']
};

describe('ExportService', () => {
  it('queries events with project, time window and limit parameters', async () => {
    const mockRows = [
      {
        id: 'evt_1',
        occurredAt: '2026-09-01T12:00:00.000Z',
        eventName: 'signup',
        distinctId: 'usr_100',
        userId: 'usr_100',
        anonymousId: null,
        sessionId: 'sess_1',
        country: 'US',
        region: 'CA',
        city: 'San Francisco',
        os: 'macOS',
        deviceType: 'desktop',
        browser: 'Chrome',
        properties: { plan: 'growth' }
      }
    ];

    const db = mockDatabase((query, values) => {
      expect(query).toContain('FROM events e');
      expect(values[0]).toBe('proj_1');
      return rows(mockRows);
    });

    const projectsMock = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Production', organizationId: 'org_1' })
    };

    const service = new ExportService(db as never, projectsMock as never);
    const result = await service.exportEvents(dummyUser, {
      projectId: 'proj_1',
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-02T00:00:00.000Z',
      limit: 100
    });

    expect(result.count).toBe(1);
    expect(result.project.name).toBe('Production');
    expect(result.events[0].eventName).toBe('signup');
  });

  it('rejects email export for free tier cloud organizations', async () => {
    const db = mockDatabase(() => rows([]));
    const projectsMock = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Production', organizationId: 'org_1' })
    };
    const entitlementsMock = {
      getSnapshot: vi.fn().mockResolvedValue({
        deploymentMode: 'cloud',
        plan: 'free',
        features: { sessionReplay: false, alerts: false }
      })
    };

    const service = new ExportService(db as never, projectsMock as never, entitlementsMock as never);

    await expect(
      service.emailExport(dummyUser, { projectId: 'proj_1', recipientEmail: 'test@example.com' })
    ).rejects.toThrow(/available on TraceIQ Pro/);
  });

  it('allows email export for Pro organizations and calls email service with CSV attachment', async () => {
    const mockRows = [
      {
        id: 'evt_1',
        occurredAt: '2026-09-01T12:00:00.000Z',
        eventName: 'purchase',
        distinctId: 'usr_200',
        userId: 'usr_200',
        anonymousId: null,
        sessionId: 'sess_2',
        country: 'GB',
        region: 'ENG',
        city: 'London',
        os: 'iOS',
        deviceType: 'mobile',
        browser: 'Safari',
        properties: { amount: 99 }
      }
    ];

    const db = mockDatabase(() => rows(mockRows));
    const projectsMock = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Store App', organizationId: 'org_1' })
    };
    const entitlementsMock = {
      getSnapshot: vi.fn().mockResolvedValue({
        deploymentMode: 'cloud',
        plan: 'pro',
        features: { sessionReplay: true, alerts: true }
      })
    };
    const emailSendMock = vi.fn().mockResolvedValue({ ok: true });
    const emailMock = {
      configured: true,
      send: emailSendMock
    };

    const service = new ExportService(
      db as never,
      projectsMock as never,
      entitlementsMock as never,
      emailMock as never
    );

    const result = await service.emailExport(dummyUser, {
      projectId: 'proj_1',
      recipientEmail: 'analyst@company.com',
      format: 'csv'
    });

    expect(result.ok).toBe(true);
    expect(result.recipient).toBe('analyst@company.com');
    expect(emailSendMock).toHaveBeenCalledTimes(1);

    const emailPayload = emailSendMock.mock.calls[0][0];
    expect(emailPayload.to).toEqual(['analyst@company.com']);
    expect(emailPayload.subject).toContain('Store App');
    expect(emailPayload.attachments).toHaveLength(1);
    expect(emailPayload.attachments[0].filename).toContain('store_app');
    expect(emailPayload.attachments[0].contentType).toBe('text/csv');
  });

  it('handles JSON format email exports with json attachment', async () => {
    const mockRows = [{ id: 'evt_2', eventName: 'login' }];
    const db = mockDatabase(() => rows(mockRows));
    const projectsMock = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', name: 'Web', organizationId: 'org_1' })
    };
    const entitlementsMock = {
      getSnapshot: vi.fn().mockResolvedValue({ deploymentMode: 'self_hosted', plan: 'self_hosted' })
    };
    const emailSendMock = vi.fn().mockResolvedValue({ ok: true });
    const emailMock = { configured: true, send: emailSendMock };

    const service = new ExportService(
      db as never,
      projectsMock as never,
      entitlementsMock as never,
      emailMock as never
    );

    const result = await service.emailExport(dummyUser, {
      projectId: 'proj_1',
      format: 'json',
      recipientEmail: 'dev@company.com'
    });

    expect(result.ok).toBe(true);
    expect(result.format).toBe('json');
    const emailPayload = emailSendMock.mock.calls[0][0];
    expect(emailPayload.attachments[0].filename.endsWith('.json')).toBe(true);
    expect(emailPayload.attachments[0].contentType).toBe('application/json');
  });
});
