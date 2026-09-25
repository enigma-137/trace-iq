import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { SetupVerificationsService } from '../src/modules/setup-verifications/setup-verifications.service';
import { SetupVerificationsController } from '../src/modules/setup-verifications/setup-verifications.controller';
import { EventsService } from '../src/modules/events/events.service';
import { affected, empty, mockDatabase, rows } from './helpers/mock-db';

describe('SetupVerificationsService Core & Ingestion', () => {
  it('creates verification session and returns id with expiration', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('INSERT INTO setup_verifications')) {
        return rows([
          {
            id: 'verify_test_123',
            project_id: 'proj_123',
            status: 'pending',
            expires_at: new Date(Date.now() + 300000).toISOString(),
            verified_at: null,
            verified_event_name: null,
            verified_event_id: null,
            verified_metadata: null,
            created_at: new Date().toISOString()
          }
        ]);
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const result = await service.createSession('proj_123', 300);

    expect(result.verificationId).toMatch(/^verify_/);
    expect(result.projectId).toBe('proj_123');
    expect(result.expiresAt).toBeDefined();
  });

  it('authenticates writeKey and rejects if invalid for project', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM project_write_keys pwk')) {
        return empty();
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const isValid = await service.authenticateWriteKey('invalid_key', 'proj_123');
    expect(isValid).toBe(false);
  });

  it('records verification when event has matching verification_id', async () => {
    const verificationRecord = {
      id: 'verify_abc_789',
      project_id: 'proj_1',
      status: 'pending',
      expires_at: new Date(Date.now() + 300000).toISOString(),
      verified_at: null,
      verified_event_name: null,
      verified_event_id: null,
      verified_metadata: null,
      created_at: new Date().toISOString()
    };

    const db = mockDatabase((text) => {
      if (text.includes('UPDATE setup_verifications') && text.includes('RETURNING *')) {
        return rows([{
          ...verificationRecord,
          status: 'verified',
          verified_at: new Date().toISOString(),
          verified_event_name: 'traceiq_setup_verified'
        }]);
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const verified = await service.recordVerificationIfMatching(
      'proj_1',
      {
        eventName: 'traceiq_setup_verified',
        properties: { verification_id: 'verify_abc_789', framework: 'Next.js' },
        environment: 'development'
      },
      { headers: { host: 'localhost:3000' } },
      'evt_123'
    );

    expect(verified).toBe(true);
  });

  it('rejects expired verification IDs', async () => {
    // Database returns no row when updating with "expires_at > now()" because session expired
    const db = mockDatabase((text) => {
      if (text.includes('UPDATE setup_verifications')) {
        return empty(); // expired or not found
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const verified = await service.recordVerificationIfMatching(
      'proj_1',
      {
        eventName: 'traceiq_setup_verified',
        properties: { verification_id: 'verify_expired_123' }
      }
    );

    expect(verified).toBe(false);
  });

  it('rejects verification ID belonging to another project', async () => {
    // Session exists for proj_2, but incoming event is for proj_1
    const db = mockDatabase((text, values) => {
      if (text.includes('UPDATE setup_verifications')) {
        const targetProj = values[1];
        if (targetProj === 'proj_2') {
          return rows([{ id: 'verify_diff_proj', status: 'verified' }]);
        }
        return empty();
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const verified = await service.recordVerificationIfMatching(
      'proj_1', // wrong project
      {
        eventName: 'traceiq_setup_verified',
        properties: { verification_id: 'verify_diff_proj' }
      }
    );

    expect(verified).toBe(false);
  });

  it('rejects duplicate matching events on already-completed sessions', async () => {
    // Database query matches WHERE status = 'pending'. Once verified, subsequent updates match 0 rows.
    let updateCount = 0;
    const db = mockDatabase((text) => {
      if (text.includes('UPDATE setup_verifications')) {
        updateCount++;
        if (updateCount === 1) {
          return rows([{ id: 'verify_once', status: 'verified' }]);
        }
        return empty(); // Already verified, status != 'pending'
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const firstCall = await service.recordVerificationIfMatching('proj_1', {
      eventName: 'traceiq_setup_verified',
      properties: { verification_id: 'verify_once' }
    });
    expect(firstCall).toBe(true);

    const secondCall = await service.recordVerificationIfMatching('proj_1', {
      eventName: 'traceiq_setup_verified',
      properties: { verification_id: 'verify_once' }
    });
    expect(secondCall).toBe(false);
  });

  it('cleans up SSE subscription immediately after success', () => {
    const db = mockDatabase(() => empty());
    const service = new SetupVerificationsService(db as never);

    let callbackFiredCount = 0;
    const unsubscribe = service.subscribeToVerification('verify_sub_123', (payload) => {
      callbackFiredCount++;
    });

    // Simulate verification broadcast
    service.broadcastVerification({
      verificationId: 'verify_sub_123',
      projectId: 'proj_1',
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      event: {
        id: 'evt_1',
        name: 'traceiq_setup_verified'
      }
    });

    expect(callbackFiredCount).toBe(1);

    // Unsubscribe (clean up)
    unsubscribe();

    // Broadcast again - callback should NOT fire again
    service.broadcastVerification({
      verificationId: 'verify_sub_123',
      projectId: 'proj_1',
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      event: {
        id: 'evt_2',
        name: 'traceiq_setup_verified'
      }
    });

    expect(callbackFiredCount).toBe(1);
  });

  it('cleans up server listener when client disconnects/aborts and returns active listener count to 0', () => {
    const db = mockDatabase(() => empty());
    const service = new SetupVerificationsService(db as never);

    expect(service.getActiveObserverCount()).toBe(0);

    // Client connects via SSE -> subscribe
    const unsubscribe = service.subscribeToVerification('verify_abort_test', () => {});
    expect(service.getActiveObserverCount()).toBe(1);

    // Client aborts / disconnects -> req.on('close') triggers unsubscribe
    unsubscribe();
    expect(service.getActiveObserverCount()).toBe(0);
  });

  it('controller streamVerificationEvents wires req "close" event to cleanup and drops observer count to 0', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('FROM setup_verifications')) {
        return rows([{
          id: 'verify_ctrl_disconnect',
          project_id: 'proj_1',
          status: 'pending',
          expires_at: new Date(Date.now() + 300000).toISOString(),
          created_at: new Date().toISOString()
        }]);
      }
      return empty();
    });

    const service = new SetupVerificationsService(db as never);
    const authService = {} as any;
    const projectsService = {} as any;
    const controller = new SetupVerificationsController(service, authService, projectsService);

    expect(service.getActiveObserverCount()).toBe(0);

    const req = new EventEmitter();
    const written: string[] = [];
    const res = {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(),
      write: vi.fn((data) => written.push(data)),
      end: vi.fn(),
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };

    await controller.streamVerificationEvents('verify_ctrl_disconnect', req as any, res as any);

    // Initial connection sent, subscription is active
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
    expect(service.getActiveObserverCount()).toBe(1);

    // Client closes connection (HTTP TCP socket close)
    req.emit('close');

    // Observer count drops back to 0
    expect(service.getActiveObserverCount()).toBe(0);
  });

  it('supports PostgreSQL LISTEN/NOTIFY payload parsing for multi-instance deployments', () => {
    const db = mockDatabase(() => empty());
    const service = new SetupVerificationsService(db as never);

    const received: unknown[] = [];
    service.subscribeToVerification('verify_cluster_1', (payload) => {
      received.push(payload);
    });

    // Simulate PostgreSQL NOTIFY event payload
    const notifyPayload = JSON.stringify({
      verificationId: 'verify_cluster_1',
      projectId: 'proj_multi',
      status: 'verified',
      verifiedAt: new Date().toISOString(),
      event: {
        id: 'evt_cluster',
        name: 'traceiq_setup_verified'
      }
    });

    // Invoke notification receiver
    service.handlePgNotification(notifyPayload);

    expect(received.length).toBe(1);
    expect((received[0] as { verificationId: string }).verificationId).toBe('verify_cluster_1');
  });
});

describe('Setup Verification End-to-End Ingestion Hook', () => {
  it('triggers verification service inside EventsService.ingestWithAuth', async () => {
    const db = mockDatabase((text) => {
      if (text.includes('INSERT INTO events')) {
        return affected(1);
      }
      return affected(1);
    });

    const webhooks = { deliverForEvent: vi.fn().mockResolvedValue(undefined) };
    const achievements = { afterProjectIngest: vi.fn().mockResolvedValue(undefined) };
    const usage = {
      consumeProjectEvents: vi.fn().mockResolvedValue({
        currentUsage: 10,
        limit: 1000,
        warningPercentage: undefined
      })
    };
    const setupVerifications = new SetupVerificationsService(db as never);
    const recordSpy = vi.spyOn(setupVerifications, 'recordVerificationIfMatching').mockResolvedValue(true);

    const eventsService = new EventsService(
      db as never,
      webhooks as never,
      achievements as never,
      usage as never,
      setupVerifications
    );

    await eventsService.ingestWithAuth(
      {
        projectId: 'proj_1',
        organizationId: 'org_1',
        writeKeyId: 'key_1',
        plan: 'free',
        environment: 'development'
      },
      {
        eventName: 'traceiq_setup_verified',
        properties: { verification_id: 'verify_live_999' }
      },
      {
        ip: '127.0.0.1',
        headers: { host: 'localhost:3000' }
      }
    );

    expect(recordSpy).toHaveBeenCalledTimes(1);
    expect(recordSpy).toHaveBeenCalledWith(
      'proj_1',
      expect.objectContaining({
        eventName: 'traceiq_setup_verified',
        properties: { verification_id: 'verify_live_999' }
      }),
      expect.objectContaining({
        ip: '127.0.0.1',
        headers: { host: 'localhost:3000' }
      }),
      expect.any(String)
    );
  });
});
