import { describe, expect, it } from 'vitest';
import {
  failedStatusSql,
  isFailedStatus,
  isFailureEventName,
  isNetworkFailureMessage,
  requestTraceStatus
} from '../src/common/failures';
import { eventToLog } from '../src/modules/observability/observability.service';
import {
  FailureFacts,
  classifyHealth,
  describeFailures,
  emptyFailureFacts,
  failureNarrative
} from '../src/modules/insights/failure-facts';
import { InsightsService } from '../src/modules/insights/insights.service';
import { AnalyticsService } from '../src/modules/analytics/analytics.service';
import { mockDatabase, rows, empty } from './helpers/mock-db';

const PROJECT = { id: 'p1', name: 'Nuwell', slug: 'n', organizationId: 'o1', organizationName: 'Org', role: 'owner' };

// The pattern from a real outage: the backend was gone, sign-in requests got no
// response, the app caught "Failed to fetch" and tracked login_failed.
const OUTAGE: FailureFacts = {
  ...emptyFailureFacts(),
  exceptions: 2,
  failedRequests: 4,
  networkErrors: 3,
  totalRequests: 6,
  failedActions: 2,
  affectedUsers: 2,
  topError: { type: 'TypeError', message: 'Failed to fetch', count: 2, users: 2 },
  topFailedRequest: { method: 'POST', path: '/api/user/login/', status: 0, count: 3 },
  topFailedAction: { name: 'login_failed', count: 2, users: 2 },
  firstAt: '2026-11-06T18:38:00.000Z',
  lastAt: '2026-11-06T19:34:26.000Z'
};

describe('shared failure rules', () => {
  it('treats a request with no response (status 0) as failed', () => {
    expect(isFailedStatus(0)).toBe(true);
    expect(isFailedStatus(401)).toBe(true);
    expect(isFailedStatus(503)).toBe(true);
    expect(isFailedStatus(204)).toBe(false);
    expect(isFailedStatus(null)).toBe(false);
    expect(failedStatusSql('status')).toBe('(status >= 400 OR status = 0)');
  });

  it('marks no-response and 5xx requests as errors in traces', () => {
    expect(requestTraceStatus(0)).toBe('error');
    expect(requestTraceStatus(502)).toBe('error');
    expect(requestTraceStatus(404)).toBe('warning');
    expect(requestTraceStatus(200)).toBe('success');
  });

  it('recognises network failure messages across browsers and clients', () => {
    for (const message of [
      'Failed to fetch',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
      'Network request failed',
      'Network Error',
      'net::ERR_CONNECTION_REFUSED',
      'connect ECONNREFUSED 127.0.0.1:5432',
      'fetch failed'
    ]) {
      expect(isNetworkFailureMessage(message), message).toBe(true);
    }
    expect(isNetworkFailureMessage('Cannot read properties of undefined')).toBe(false);
    expect(isNetworkFailureMessage('Page failed to load images')).toBe(false);
  });

  it('recognises tracked failure events by name', () => {
    for (const name of ['login_failed', 'checkout_error', 'payment_declined', 'paymentDeclined', 'signup.failed', 'upload failure']) {
      expect(isFailureEventName(name), name).toBe(true);
    }
    for (const name of ['page_viewed', 'error_boundary_shown', '$exception', 'failed_login_banner_dismissed', 'login']) {
      expect(isFailureEventName(name), name).toBe(false);
    }
  });
});

describe('log severity for mirrored events', () => {
  const at = new Date('2026-11-06T19:34:26.890Z');

  it('logs a caught "Failed to fetch" as an error, not a warning', () => {
    const log = eventToLog({
      eventId: 'e1',
      eventName: '$exception',
      occurredAt: at,
      properties: { type: 'TypeError', message: 'Failed to fetch', handled: true }
    });
    expect(log?.level).toBe('error');
    expect(log?.status).toBe('error');
  });

  it('keeps other caught exceptions as warnings and uncaught ones as errors', () => {
    const caught = eventToLog({ eventId: 'e2', eventName: '$exception', occurredAt: at, properties: { type: 'Error', message: 'Invalid email', handled: true } });
    const uncaught = eventToLog({ eventId: 'e3', eventName: '$exception', occurredAt: at, properties: { type: 'Error', message: 'Invalid email' } });
    expect(caught?.level).toBe('warn');
    expect(uncaught?.level).toBe('error');
  });

  it('logs a tracked failure event as a warning so it stands out from page views', () => {
    const failed = eventToLog({ eventId: 'e4', eventName: 'login_failed', occurredAt: at, properties: { page: 'Sign In' } });
    const viewed = eventToLog({ eventId: 'e5', eventName: 'page_viewed', occurredAt: at, properties: { page: 'Sign In' } });
    expect(failed?.level).toBe('warn');
    expect(failed?.status).toBe('warning');
    expect(viewed?.level).toBe('info');
  });
});

describe('project health', () => {
  it('calls requests with no response an outage', () => {
    expect(classifyHealth(OUTAGE, 50)).toBe('outage');
    expect(describeFailures(OUTAGE)).toBe('3 requests got no response · 1 failed request · 2 errors · login_failed × 2 · 2 users affected');
  });

  it('calls a single unreachable request or exception degraded', () => {
    expect(classifyHealth({ ...emptyFailureFacts(), networkErrors: 1, failedRequests: 1, totalRequests: 40 }, 100)).toBe('degraded');
    expect(classifyHealth({ ...emptyFailureFacts(), exceptions: 1 }, 100)).toBe('degraded');
  });

  it('does not cry wolf over an occasional 4xx', () => {
    expect(classifyHealth({ ...emptyFailureFacts(), failedRequests: 2, totalRequests: 200 }, 300)).toBe('operational');
  });

  it('is idle, never operational, when there is no data', () => {
    expect(classifyHealth(emptyFailureFacts(), 0)).toBe('idle');
  });

  it('reports the outage from the health endpoint', async () => {
    const db = mockDatabase((text) => {
      if (/AS exceptions/.test(text)) {
        return rows([{ exceptions: 2, failed_requests: 4, network_errors: 3, server_errors: 0, total_requests: 6, failed_actions: 2, affected_users: 2, first_at: OUTAGE.firstAt, last_at: OUTAGE.lastAt }]);
      }
      if (/kind = 'request'\s+GROUP BY/.test(text)) return rows([OUTAGE.topFailedRequest!]);
      if (/count\(\*\)::int AS count FROM events/.test(text)) return rows([{ count: 50 }]);
      return empty();
    });
    const projects = { resolveActiveProject: async () => PROJECT };
    const service = new InsightsService(db as never, projects as never, {} as never, {} as never);

    const health = await service.getHealth({ id: 'u', email: 'u@example.com' }, undefined, '60');

    expect(health.status).toBe('outage');
    expect(health.summary).toMatch(/^Outage: 3 requests got no response/);
    expect(health.failures.topFailedRequest).toMatchObject({ path: '/api/user/login/', status: 0 });
    // Network failures are counted by status 0, not by a 4xx/5xx-only rule.
    expect(db.calls.some((call) => call.text.includes('>= 400 OR') && call.text.includes('= 0)'))).toBe(true);
  });
});

describe('story', () => {
  it('opens with the outage', () => {
    const line = failureNarrative(OUTAGE);
    expect(line).toMatch(/^Heads up: 3 requests got no response from your backend \(POST \/api\/user\/login\/\) between 18:38 UTC and 19:34 UTC, affecting 2 users\./);
    expect(line).toContain('login_failed happened 2 times for 2 users.');
    expect(line).toContain('2 errors were captured, most often TypeError: Failed to fetch.');
  });

  it('says nothing about failures when there were none', () => {
    expect(failureNarrative(emptyFailureFacts())).toBeNull();
  });

  it('puts failures before activity in the template narrative', async () => {
    const db = mockDatabase((text) => {
      if (/AS today/.test(text)) return rows([{ today: 120, yesterday: 100, uniques_today: 34, active_now: 3 }]);
      if (/AS exceptions/.test(text)) {
        return rows([{ exceptions: 2, failed_requests: 4, network_errors: 3, server_errors: 0, total_requests: 6, failed_actions: 2, affected_users: 2, first_at: OUTAGE.firstAt, last_at: OUTAGE.lastAt }]);
      }
      return empty();
    });
    const projects = { resolveActiveProject: async () => PROJECT };
    const ai = { generateStoryNarrative: async () => null };
    const service = new InsightsService(db as never, projects as never, ai as never, {} as never);

    const story = await service.getTodayStory({ id: 'u', email: 'u@example.com' });

    expect(story.narrative).toMatch(/^Heads up: 3 requests got no response/);
    expect(story.narrative.indexOf('Heads up')).toBeLessThan(story.narrative.indexOf('Events are up'));
    expect(story.facts.failures.networkErrors).toBe(3);
  });
});

describe('API performance', () => {
  it('counts requests with no response as errors', async () => {
    const db = mockDatabase((text) => {
      if (/AS client/.test(text)) return rows([{ client: 52, server: 0 }]);
      if (/SELECT count\(\*\)::int AS total/.test(text)) {
        return rows([{ total: 52, errors: 9, network_errors: 4, avg: 898, p50: 754, p95: 1893 }]);
      }
      return empty();
    });
    const projects = { resolveActiveProject: async () => PROJECT };
    const analytics = new AnalyticsService(db as never, projects as never);

    const perf = await analytics.getApiPerformance({ id: 'u', email: 'u@example.com' }, '2');

    expect(perf.summary).toMatchObject({ totalRequests: 52, errorCount: 9, networkErrorCount: 4, errorRate: 17.3 });
    const errorQueries = db.calls.filter((call) => /AS errors|WHERE \(status/.test(call.text));
    expect(errorQueries.length).toBeGreaterThan(0);
    for (const call of errorQueries) expect(call.text).toContain('(status >= 400 OR status = 0)');
  });
});
