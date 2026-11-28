import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { EventsService } from '../src/modules/events/events.service';
import { ImportsController } from '../src/modules/imports/imports.controller';
import { ImportsService } from '../src/modules/imports/imports.service';
import { PostHogClient, normalizePostHogHost, planWindows } from '../src/modules/imports/posthog-client';
import { mapPostHogEvent } from '../src/modules/imports/posthog-mapper';
import { normalizeTraceIQEvent } from '../src/modules/imports/traceiq-format';
import { affected, mockDatabase, rows } from './helpers/mock-db';

vi.mock('../src/common/geo', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/common/geo')>()),
  resolveGeo: (ip?: string) => (ip ? { ipAddress: ip, country: 'XX' } : {})
}));

function eventsService() {
  const db = mockDatabase((text) => {
    if (text.includes('INSERT INTO users')) return rows([{ external_id: 'u1', id: 'usr_1' }]);
    return affected(1);
  });
  const webhooks = { deliverForEvent: vi.fn().mockResolvedValue(undefined) };
  const achievements = { afterProjectIngest: vi.fn().mockResolvedValue(undefined) };
  const service = new EventsService(db as never, webhooks as never, achievements as never);
  return { db, webhooks, service };
}

describe('EventsService.ingestImportBatch', () => {
  it('keeps the source location, never adds the importer’s IP, and skips webhooks', async () => {
    const { db, webhooks, service } = eventsService();
    const result = await service.ingestImportBatch({ id: 'proj_1', organizationId: 'org_1' }, [
      { eventName: 'signup', userId: 'u1', timestamp: '2024-01-02T03:04:05Z', networkInfo: { country: 'NG', city: 'Lagos', ipAddress: '1.2.3.4' } }
    ]);
    expect(result.results[0]).toMatchObject({ accepted: true });
    expect(webhooks.deliverForEvent).not.toHaveBeenCalled();

    const insert = db.queryCalls(/INSERT INTO events/)[0];
    const serialized = JSON.stringify(insert.values);
    expect(serialized).toContain('Lagos');
    expect(serialized).not.toContain('1.2.3.4');
    expect(serialized).not.toContain('XX');
    expect(serialized).toContain('2024-01-02T03:04:05');
  });

  it('enforces the batch limit', async () => {
    const { service } = eventsService();
    await expect(service.ingestImportBatch({ id: 'p', organizationId: 'o' }, [])).rejects.toBeInstanceOf(BadRequestException);
    const batch = Array.from({ length: 501 }, () => ({ eventName: 'x' }));
    await expect(service.ingestImportBatch({ id: 'p', organizationId: 'o' }, batch)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PostHog mapper', () => {
  it('is identical to the CLI copy', () => {
    const block = (file: string) => {
      const text = fs.readFileSync(path.resolve(__dirname, file), 'utf8');
      return text.slice(text.indexOf('\n', text.indexOf('// >>> posthog-mapper')) + 1, text.indexOf('// <<< posthog-mapper')).trim();
    };
    expect(block('../src/modules/imports/posthog-mapper.ts')).toBe(block('../../../packages/usetrace/src/manage/posthog-import.ts'));
  });

  it('maps PostHog GeoIP to location fields', () => {
    const result = mapPostHogEvent({
      event: 'clicked',
      distinct_id: 'u1',
      timestamp: '2024-01-01T00:00:00Z',
      properties: { $geoip_country_code: 'NG', $geoip_city_name: 'Lagos', $geoip_subdivision_1_name: 'Lagos', $ip: '1.2.3.4' }
    });
    expect(result).toMatchObject({ event: { networkInfo: { country: 'NG', city: 'Lagos', region: 'Lagos' } } });
    expect(JSON.stringify(result)).not.toContain('1.2.3.4');
  });
});

describe('normalizeTraceIQEvent', () => {
  it('reads rows from the dashboard JSON export', () => {
    const result = normalizeTraceIQEvent({
      id: 'evt_1',
      occurredAt: '2024-05-01T10:00:00.000Z',
      eventName: 'checkout',
      distinctId: 'u1',
      userId: 'u1',
      anonymousId: null,
      sessionId: 's1',
      country: 'NG',
      city: 'Lagos',
      os: 'iOS',
      properties: { total: 10 }
    });
    expect(result).toMatchObject({
      event: {
        eventName: 'checkout',
        timestamp: '2024-05-01T10:00:00.000Z',
        userId: 'u1',
        sessionId: 's1',
        properties: { total: 10 },
        deviceInfo: { os: 'iOS' },
        networkInfo: { country: 'NG', city: 'Lagos' },
        context: { import: { source: 'traceiq', id: 'evt_1' } }
      }
    });
  });

  it('reads ingestion-shaped events and rejects incomplete ones', () => {
    expect(normalizeTraceIQEvent({ eventName: 'x', timestamp: '2024-01-01T00:00:00Z', anonymousId: 'a' })).toMatchObject({ event: { anonymousId: 'a' } });
    expect(normalizeTraceIQEvent({ eventName: 'x' })).toEqual({ skipped: '(missing or invalid timestamp)' });
    expect(normalizeTraceIQEvent({ timestamp: '2024-01-01' })).toEqual({ skipped: '(missing eventName)' });
  });
});

describe('PostHog client', () => {
  it('normalizes hosts', () => {
    expect(normalizePostHogHost('eu')).toBe('https://eu.posthog.com');
    expect(normalizePostHogHost('us.i.posthog.com')).toBe('https://us.posthog.com');
    expect(normalizePostHogHost('https://ph.example.com/')).toBe('https://ph.example.com');
    expect(normalizePostHogHost(undefined)).toBe('https://us.posthog.com');
  });

  it('plans week-long windows', () => {
    const windows = planWindows(new Date('2024-01-01T00:00:00Z'), new Date('2024-01-10T00:00:00Z'));
    expect(windows.map((w) => w.end.toISOString())).toEqual(['2024-01-08T00:00:00.000Z', '2024-01-10T00:00:00.000Z']);
  });

  it('refuses private hosts (SSRF)', async () => {
    const client = new PostHogClient({ host: 'http://127.0.0.1:8000', projectId: '1', apiKey: 'phx' }, async () => undefined, vi.fn() as never);
    await expect(client.checkAccess()).rejects.toBeInstanceOf(BadRequestException);
  });
});

// ─── ImportsService ──────────────────────────────────────────────────────────

const user = { id: 'user_1', authMethod: 'session' } as never;

function importsSetup(options: { role?: string; insertConflict?: boolean; statuses?: string[] } = {}) {
  const statuses = [...(options.statuses ?? [])];
  const db = mockDatabase((text) => {
    if (text.includes('INSERT INTO import_jobs')) {
      if (options.insertConflict) throw Object.assign(new Error('dup'), { code: '23505' });
      return affected(1);
    }
    if (text.includes('SELECT status FROM import_jobs')) return rows([{ status: statuses.shift() ?? 'running' }]);
    if (text.includes('SELECT * FROM import_jobs')) {
      return rows([
        {
          id: 'imp_1',
          project_id: 'proj_1',
          source: 'posthog',
          status: 'running',
          source_host: 'https://eu.posthog.com',
          source_project: '42',
          range_start: new Date('2024-01-01'),
          range_end: new Date('2024-01-10'),
          completed_through: null,
          windows_total: 2,
          windows_done: 0,
          read_count: '0',
          imported_count: '0',
          skipped_count: '0',
          rejected_count: '0',
          skipped_events: {},
          error: null,
          created_at: new Date(),
          heartbeat_at: new Date(),
          finished_at: null
        }
      ]);
    }
    return affected(1);
  });
  const project = { id: 'proj_1', organizationId: 'org_1', name: 'P', slug: 'p', organizationName: 'O', role: options.role ?? 'owner' };
  const projects = { requireWritableProject: vi.fn().mockResolvedValue(project), requireActiveProject: vi.fn().mockResolvedValue(project) };
  const events = {
    ingestImportBatch: vi.fn(async (_p: unknown, batch: unknown[]) => ({ accepted: true, results: batch.map(() => ({ accepted: true })) }))
  };
  const service = new ImportsService(db as never, projects as never, events as never);
  service.sleep = async () => undefined;
  return { db, events, service, project };
}

describe('ImportsService.importEvents', () => {
  it('maps a PostHog chunk and imports it', async () => {
    const { service, events } = importsSetup();
    const result = await service.importEvents(user, {
      format: 'posthog',
      events: [
        { event: '$pageview', distinct_id: 'u1', timestamp: '2024-01-01T00:00:00Z', properties: { $current_url: 'https://a.com/x' } },
        { event: '$autocapture', distinct_id: 'u1', timestamp: '2024-01-01T00:00:00Z' }
      ]
    });
    expect(result).toMatchObject({ read: 2, imported: 1, skipped: 1, skippedEvents: { $autocapture: 1 } });
    expect(events.ingestImportBatch.mock.calls[0][1]).toEqual([expect.objectContaining({ eventName: '$page' })]);
  });

  it('only lets owners and admins import', async () => {
    const { service } = importsSetup({ role: 'member' });
    await expect(service.importEvents(user, { format: 'traceiq', events: [{}] })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('validates format and size', async () => {
    const { service } = importsSetup();
    await expect(service.importEvents(user, { format: 'csv', events: [{}] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.importEvents(user, { format: 'traceiq', events: new Array(501).fill({}) })).rejects.toBeInstanceOf(BadRequestException);
  });
});

function fakeClient(options: { fail?: boolean } = {}) {
  let runs = 0;
  return {
    checkAccess: vi.fn().mockResolvedValue(undefined),
    startExport: vi.fn(async () => `run${++runs}`),
    exportStatus: vi.fn(async (runId: string) => {
      if (options.fail && runId === 'run2') throw new Error('The PostHog export failed: boom');
      return ['file1'];
    }),
    cancelExport: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn(async function* () {
      yield { event: 'signed_up', distinct_id: 'u1', timestamp: '2024-01-02T00:00:00Z', properties: {} };
      yield { event: '$autocapture', distinct_id: 'u1', timestamp: '2024-01-02T00:00:00Z' };
    })
  };
}

describe('ImportsService PostHog jobs', () => {
  const body = { posthogProjectId: '42', host: 'eu', apiKey: 'phx_key', since: '2024-01-01', until: '2024-01-10' };

  it('checks access first, then runs every week and completes', async () => {
    const { service, db, events } = importsSetup();
    const client = fakeClient();
    service.createPostHogClient = vi.fn(() => client as never);

    await service.startPostHogImport(user, body);
    await vi.waitFor(() => expect(db.queryCalls(/SET status = \$2/).length).toBe(1));

    expect(service.createPostHogClient).toHaveBeenCalledWith({ host: 'https://eu.posthog.com', projectId: '42', apiKey: 'phx_key' });
    expect(client.checkAccess).toHaveBeenCalled();
    expect(client.startExport).toHaveBeenCalledTimes(2);
    expect(events.ingestImportBatch).toHaveBeenCalledTimes(2);
    expect(db.queryCalls(/SET status = \$2/)[0].values[1]).toBe('completed');
    // The key is never written to the database.
    expect(JSON.stringify(db.calls)).not.toContain('phx_key');
  });

  it('records where it got to when a week fails', async () => {
    const { service, db } = importsSetup();
    service.createPostHogClient = () => fakeClient({ fail: true }) as never;
    await service.startPostHogImport(user, body);
    await vi.waitFor(() => expect(db.queryCalls(/SET status = \$2/).length).toBe(1));
    const finish = db.queryCalls(/SET status = \$2/)[0];
    expect(finish.values[1]).toBe('failed');
    const progress = db.queryCalls(/completed_through = COALESCE/).map((c) => c.values[7]).filter(Boolean);
    expect(progress).toContain('2024-01-08T00:00:00.000Z');
  });

  it('stops and cancels the PostHog export when cancelled', async () => {
    const { service, db } = importsSetup({ statuses: ['running', 'cancelling'] });
    const client = fakeClient();
    service.createPostHogClient = () => client as never;
    await service.startPostHogImport(user, body);
    await vi.waitFor(() => expect(db.queryCalls(/SET status = \$2/).length).toBe(1));
    expect(db.queryCalls(/SET status = \$2/)[0].values[1]).toBe('cancelled');
    expect(client.cancelExport).toHaveBeenCalledWith('run1');
  });

  it('allows one active import per project', async () => {
    const { service } = importsSetup({ insertConflict: true });
    service.createPostHogClient = () => fakeClient() as never;
    await expect(service.startPostHogImport(user, body)).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates the request before calling PostHog', async () => {
    const { service } = importsSetup();
    service.createPostHogClient = vi.fn(() => fakeClient() as never);
    await expect(service.startPostHogImport(user, { ...body, apiKey: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.startPostHogImport(user, { ...body, posthogProjectId: 'abc' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.startPostHogImport(user, { ...body, since: undefined })).rejects.toBeInstanceOf(BadRequestException);
    expect(service.createPostHogClient).not.toHaveBeenCalled();
  });
});

describe('ImportsService file imports', () => {
  function fileSetup(job: { status?: string; created_by_user_id?: string } | null = {}) {
    const setup = importsSetup();
    setup.db.query.mockImplementation(async (text: string, values: unknown[] = []) => {
      setup.db.calls.push({ text, values });
      if (text.includes('SELECT status, created_by_user_id FROM import_jobs')) {
        return job ? rows([{ status: job.status ?? 'running', created_by_user_id: job.created_by_user_id ?? 'user_1' }]) : rows([]);
      }
      if (text.includes('SELECT * FROM import_jobs')) {
        return rows([
          {
            id: 'imp_f', project_id: 'proj_1', source: 'file', status: 'running', source_host: null, source_project: null,
            range_start: null, range_end: null, file_name: 'events.jsonl', file_format: 'posthog', completed_through: null,
            windows_total: 0, windows_done: 0, read_count: '3', imported_count: '1', skipped_count: '2', rejected_count: '0',
            skipped_events: {}, error: null, created_at: new Date(), heartbeat_at: new Date(), finished_at: null
          }
        ]);
      }
      return affected(1);
    });
    return setup;
  }

  it('records a file upload and adds each chunk to it', async () => {
    const { service, db } = fileSetup();
    const { job } = await service.startFileImport(user, { fileName: '  events.jsonl ', format: 'posthog' });
    expect(job).toMatchObject({ source: 'file', fileName: 'events.jsonl', rangeStart: null, rangeEnd: null });
    expect(db.queryCalls('INSERT INTO import_jobs')[0].values.slice(2)).toEqual(['events.jsonl', 'posthog', 'user_1']);

    await service.importEvents(user, {
      importId: 'imp_f',
      format: 'posthog',
      events: [
        { event: '$pageview', distinct_id: 'u1', timestamp: '2024-01-01T00:00:00Z' },
        { event: '$autocapture', distinct_id: 'u1', timestamp: '2024-01-01T00:00:00Z' }
      ]
    });
    const add = db.queryCalls('read_count = read_count + $2')[0];
    expect(add.values).toEqual(['imp_f', 2, 1, 1, 0, JSON.stringify({ $autocapture: 1 }), 'posthog']);
  });

  it('adds what the browser dropped and closes the record', async () => {
    const { service, db } = fileSetup();
    await service.finishFileImport(user, 'imp_f', { status: 'completed', read: 1, skipped: 1, skippedEvents: { '(lines that are not valid JSON)': 1, bad: -4 } });
    expect(db.queryCalls('read_count = read_count + $2')[0].values.slice(1, 6)).toEqual([1, 0, 1, 0, JSON.stringify({ '(lines that are not valid JSON)': 1 })]);
    expect(db.queryCalls(/SET status = \$2/)[0].values.slice(1)).toEqual(['completed', null]);
  });

  it('only accepts chunks for a running import the same person started', async () => {
    await expect(fileSetup({ created_by_user_id: 'someone_else' }).service.importEvents(user, { importId: 'imp_f', format: 'traceiq', events: [{}] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(fileSetup(null).service.finishFileImport(user, 'imp_x', { status: 'completed' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(fileSetup({ status: 'completed' }).service.importEvents(user, { importId: 'imp_f', format: 'traceiq', events: [{}] })).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates the file name and the finishing status', async () => {
    const { service } = fileSetup();
    await expect(service.startFileImport(user, { fileName: ' ' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.finishFileImport(user, 'imp_f', { status: 'running' })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ImportsController 2FA', () => {
  function controllerSetup(authMethod: 'supabase' | 'pat') {
    const stepUpError = new ForbiddenException('Step-up authentication is required.', 'STEP_UP_REQUIRED');
    const auth = {
      getDashboardUser: vi.fn().mockResolvedValue({ id: 'user_1', authMethod }),
      requireScope: vi.fn(),
      requireStepUpIfEnrolled: vi.fn(() => {
        throw stepUpError;
      })
    };
    const service = {
      startFileImport: vi.fn().mockResolvedValue({}),
      importEvents: vi.fn().mockResolvedValue({}),
      startPostHogImport: vi.fn().mockResolvedValue({}),
      finishFileImport: vi.fn().mockResolvedValue({})
    };
    return { auth, service, controller: new ImportsController(auth as never, service as never) };
  }

  it('asks a 2FA account to verify before an import starts', async () => {
    const { controller, service } = controllerSetup('supabase');
    await expect(controller.startFileImport('Bearer t', { fileName: 'a.jsonl' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.startPostHog('Bearer t', {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(controller.importEvents('Bearer t', { events: [] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.startFileImport).not.toHaveBeenCalled();
    expect(service.startPostHogImport).not.toHaveBeenCalled();
    expect(service.importEvents).not.toHaveBeenCalled();
  });

  it('does not ask again for each chunk of a started import, or to finish it', async () => {
    const { controller, auth } = controllerSetup('supabase');
    await controller.importEvents('Bearer t', { importId: 'imp_f', events: [] });
    await controller.finishFileImport('imp_f', 'Bearer t', { status: 'completed' });
    expect(auth.requireStepUpIfEnrolled).not.toHaveBeenCalled();
  });

  it('lets the CLI import with a personal access token', async () => {
    const { controller, auth, service } = controllerSetup('pat');
    await controller.importEvents('Bearer pat', { events: [] });
    await controller.startPostHog('Bearer pat', {});
    expect(auth.requireStepUpIfEnrolled).not.toHaveBeenCalled();
    expect(service.importEvents).toHaveBeenCalled();
  });
});
