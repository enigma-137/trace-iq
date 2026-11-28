import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  StatusPagesService,
  buildPublicStatusPage,
  effectiveStatus,
  normalizeSlug,
  suggestSlug
} from '../src/modules/status-pages/status-pages.service';
import { affected, mockDatabase, rows } from './helpers/mock-db';

const NOW = new Date('2026-11-28T12:00:00Z');
const page = { slug: 'acme', title: 'Acme', description: 'Acme services' };
const components = [
  { id: 'stc_api', monitor_id: 'mon_api', display_name: 'API', description: 'Public API', monitor_status: 'active' },
  { id: 'stc_web', monitor_id: 'mon_web', display_name: 'Website', description: null, monitor_status: 'active' }
];

function incident(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sti_1',
    kind: 'incident',
    title: 'Elevated errors',
    status: 'investigating',
    impact: 'major',
    component_ids: ['stc_api'],
    scheduled_start: null,
    scheduled_end: null,
    started_at: new Date('2026-11-28T11:00:00Z'),
    resolved_at: null,
    created_at: new Date('2026-11-28T11:00:00Z'),
    updates: [{ id: 'u1', incident_id: 'sti_1', status: 'investigating', body: 'Looking into it', created_at: new Date('2026-11-28T11:00:00Z') }],
    ...overrides
  } as never;
}

describe('slugs', () => {
  it('accepts valid slugs and rejects bad or reserved ones', () => {
    expect(normalizeSlug(' Acme-Co ')).toBe('acme-co');
    for (const bad of ['ab', '-acme', 'acme-', 'ac me', 'acme_co', 'a'.repeat(49)]) {
      expect(() => normalizeSlug(bad)).toThrow(BadRequestException);
    }
    expect(() => normalizeSlug('traceiq')).toThrow(BadRequestException);
  });

  it('suggests a slug from the project name', () => {
    expect(suggestSlug('My Cool App!')).toBe('my-cool-app');
    expect(suggestSlug('X')).toBe('x-status');
  });
});

describe('effectiveStatus', () => {
  const window = { kind: 'maintenance', status: 'scheduled', scheduled_start: new Date('2026-11-28T10:00:00Z'), scheduled_end: new Date('2026-11-28T14:00:00Z') } as never;
  it('starts and ends maintenance on schedule', () => {
    expect(effectiveStatus(window, new Date('2026-11-28T09:00:00Z'))).toBe('scheduled');
    expect(effectiveStatus(window, NOW)).toBe('in_progress');
    expect(effectiveStatus(window, new Date('2026-11-28T15:00:00Z'))).toBe('completed');
  });
});

describe('buildPublicStatusPage', () => {
  it('derives component state from the latest runs and day uptime from history', () => {
    const result = buildPublicStatusPage({
      page,
      components,
      dayRows: [
        { monitor_id: 'mon_api', day: '2026-11-28', passed: 95, failed: 1 },
        { monitor_id: 'mon_api', day: '2026-11-27', passed: 96, failed: 0 },
        { monitor_id: 'mon_web', day: '2026-11-28', passed: 10, failed: 10 }
      ],
      recentRuns: [
        { monitor_id: 'mon_api', status: 'passed', rn: 1 },
        { monitor_id: 'mon_web', status: 'failed', rn: 1 },
        { monitor_id: 'mon_web', status: 'timed_out', rn: 2 }
      ],
      incidents: [],
      now: NOW
    });
    const [api, web] = result.components;
    expect(api.status).toBe('operational');
    expect(web.status).toBe('down');
    expect(result.status).toBe('down');
    expect(api.history).toHaveLength(90);
    expect(api.history.at(-1)).toMatchObject({ date: '2026-11-28', level: 'degraded', uptimePercent: 98.95 });
    expect(api.history.at(-2)).toMatchObject({ level: 'operational', uptimePercent: 100 });
    expect(web.history.at(-1)).toMatchObject({ level: 'down', uptimePercent: 50 });
    expect(api.history[0]).toMatchObject({ level: 'none', uptimePercent: null });
  });

  it('one failure is degraded, not an outage', () => {
    const result = buildPublicStatusPage({
      page, components: [components[0]], dayRows: [], incidents: [], now: NOW,
      recentRuns: [{ monitor_id: 'mon_api', status: 'failed', rn: 1 }, { monitor_id: 'mon_api', status: 'passed', rn: 2 }]
    });
    expect(result.components[0].status).toBe('degraded');
  });

  it('applies open incidents and maintenance to affected components', () => {
    const result = buildPublicStatusPage({
      page, components, dayRows: [], now: NOW,
      recentRuns: [{ monitor_id: 'mon_api', status: 'passed', rn: 1 }, { monitor_id: 'mon_web', status: 'failed', rn: 1 }],
      incidents: [
        incident(),
        incident({
          id: 'sti_2', kind: 'maintenance', status: 'scheduled', impact: 'none', component_ids: ['stc_web'],
          scheduled_start: new Date('2026-11-28T11:30:00Z'), scheduled_end: new Date('2026-11-28T13:00:00Z')
        })
      ]
    });
    expect(result.components.map((c) => c.status)).toEqual(['down', 'maintenance']);
    expect(result.activeIncidents.map((i) => i.id)).toEqual(['sti_1', 'sti_2']);
  });

  it('separates upcoming maintenance and recent resolved incidents', () => {
    const result = buildPublicStatusPage({
      page, components, dayRows: [], recentRuns: [], now: NOW,
      incidents: [
        incident({ id: 'old', status: 'resolved', resolved_at: new Date('2026-11-27T10:00:00Z') }),
        incident({ id: 'future', kind: 'maintenance', status: 'scheduled', impact: 'none', scheduled_start: new Date('2026-12-01T00:00:00Z'), scheduled_end: new Date('2026-12-01T02:00:00Z') })
      ]
    });
    expect(result.pastIncidents.map((i) => i.id)).toEqual(['old']);
    expect(result.upcomingMaintenance.map((i) => i.id)).toEqual(['future']);
    expect(result.activeIncidents).toEqual([]);
    // No monitor results yet: the page doesn't claim everything is fine.
    expect(result.status).toBe('unknown');
  });

  it('never exposes monitor ids or internal fields', () => {
    const result = buildPublicStatusPage({
      page, components, dayRows: [], incidents: [incident()], now: NOW,
      recentRuns: [{ monitor_id: 'mon_api', status: 'failed', rn: 1 }]
    });
    const json = JSON.stringify(result);
    expect(json).not.toContain('mon_api');
    expect(json).not.toContain('monitor');
    expect(json).not.toContain('created_by');
  });
});

// ─── Service ────────────────────────────────────────────────────────────────

const user = { id: 'user_1', authMethod: 'session' } as never;

function setup(options: { role?: string; slugTaken?: boolean; page?: boolean; monitors?: string[] } = {}) {
  const db = mockDatabase((text, values) => {
    if (text.includes('FROM status_pages WHERE project_id')) {
      return options.page ? rows([{ id: 'stp_1', project_id: 'proj_1', slug: 'acme', title: 'Acme', description: null, enabled: true, updated_at: NOW }]) : rows([]);
    }
    if (text.includes('FROM synthetic_monitors WHERE project_id = $1 AND status') && text.includes('ANY')) {
      const wanted = values[1] as string[];
      return rows(wanted.filter((id) => (options.monitors ?? ['mon_api', 'mon_web']).includes(id)).map((id) => ({ id })));
    }
    if (text.includes('INSERT INTO status_pages') && options.slugTaken) throw Object.assign(new Error('dup'), { code: '23505' });
    return affected(1);
  });
  const project = { id: 'proj_1', organizationId: 'org_1', name: 'Acme', slug: 'acme', organizationName: 'Acme', role: options.role ?? 'owner' };
  const projects = { requireWritableProject: vi.fn().mockResolvedValue(project), requireActiveProject: vi.fn().mockResolvedValue(project) };
  return { db, service: new StatusPagesService(db as never, projects as never) };
}

const settings = {
  slug: 'acme',
  title: 'Acme status',
  enabled: true,
  components: [{ monitorId: 'mon_api', displayName: 'API' }]
};

describe('StatusPagesService.saveSettings', () => {
  it('creates the page and its components', async () => {
    const { service, db } = setup();
    await service.saveSettings(user, settings);
    expect(db.queryCalls(/INSERT INTO status_pages/)).toHaveLength(1);
    const component = db.queryCalls(/INSERT INTO status_page_components/)[0];
    expect(component.values.slice(2, 5)).toEqual(['mon_api', 'API', null]);
  });

  it('only lets owners and admins edit', async () => {
    const { service } = setup({ role: 'member' });
    await expect(service.saveSettings(user, settings)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses monitors from other projects', async () => {
    const { service } = setup({ monitors: [] });
    await expect(service.saveSettings(user, settings)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('needs a component before publishing', async () => {
    const { service } = setup();
    await expect(service.saveSettings(user, { ...settings, components: [] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports a taken address', async () => {
    const { service } = setup({ slugTaken: true });
    await expect(service.saveSettings(user, settings)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('StatusPagesService incidents', () => {
  it('requires a page first', async () => {
    const { service } = setup();
    await expect(service.createIncident(user, { title: 'Down', body: 'x' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an incident with its first update', async () => {
    const { service, db } = setup({ page: true });
    await service.createIncident(user, { title: 'API errors', body: 'Investigating', impact: 'major', componentIds: [] });
    const insert = db.queryCalls(/INSERT INTO status_incidents/)[0];
    expect(insert.values.slice(2, 6)).toEqual(['incident', 'API errors', 'investigating', 'major']);
    expect(db.queryCalls(/INSERT INTO status_incident_updates/)).toHaveLength(1);
  });

  it('validates maintenance windows and statuses', async () => {
    const { service } = setup({ page: true });
    await expect(service.createIncident(user, { kind: 'maintenance', title: 'DB upgrade', body: 'x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createIncident(user, { kind: 'maintenance', title: 'DB upgrade', body: 'x', scheduledStart: '2026-12-01T02:00:00Z', scheduledEnd: '2026-12-01T01:00:00Z' })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createIncident(user, { title: 'x', body: 'x', status: 'scheduled' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('StatusPagesService.getPublicPage', () => {
  it('404s for unknown, disabled or malformed slugs', async () => {
    const { service } = setup();
    await expect(service.getPublicPage('acme')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getPublicPage('../etc')).rejects.toBeInstanceOf(NotFoundException);
  });
});
