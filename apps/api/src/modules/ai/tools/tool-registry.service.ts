import { Injectable, Logger, Optional } from '@nestjs/common';
import { FunnelsService } from '../../funnels/funnels.service';
import { ErrorsService } from '../../errors/errors.service';
import { FlagsService } from '../../flags/flags.service';
import { UsersService } from '../../users/users.service';
import { ReplayService } from '../../replay/replay.service';
import { WebhooksService } from '../../webhooks/webhooks.service';
import { AlertsService } from '../../alerts/alerts.service';
import { CohortsService } from '../../cohorts/cohorts.service';
import { AnalyticsService } from '../../analytics/analytics.service';
import { AiSanitizerService } from '../context/ai-sanitizer.service';
import {
  EvidenceItem,
  ToolExecutionContext,
  ToolExecutionResult,
  TraceIQToolDefinition
} from './tool.interface';
import { AiToolDefinition } from '../providers/ai-provider.interface';
import { PRODUCT_GUIDE, searchProductGuide } from './product-guide';

@Injectable()
export class ToolRegistryService {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly tools = new Map<string, TraceIQToolDefinition>();

  constructor(
    private readonly sanitizer: AiSanitizerService,
    @Optional() private readonly funnels?: FunnelsService,
    @Optional() private readonly errors?: ErrorsService,
    @Optional() private readonly flags?: FlagsService,
    @Optional() private readonly users?: UsersService,
    @Optional() private readonly replay?: ReplayService,
    @Optional() private readonly webhooks?: WebhooksService,
    @Optional() private readonly alerts?: AlertsService,
    @Optional() private readonly cohorts?: CohortsService,
    @Optional() private readonly analytics?: AnalyticsService
  ) {
    this.registerTools();
  }

  private registerTools() {
    // 1. Project Overview
    this.register({
      name: 'get_overview',
      description: 'Get a comprehensive analytical overview of the project (traffic totals, active users, error counts, friction, and alert summary).',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (ctx) => {
        if (!this.analytics) throw new Error('Analytics service unavailable');
        const overview = await this.analytics.getOverview(ctx.user, ctx.projectId, ctx.organizationId);
        const sanitized = this.sanitizer.sanitizeData({
          totals: overview.totals,
          apiSummary: overview.apiTelemetry,
          topErrors: overview.topErrors?.slice(0, 5),
          alertsSummary: overview.alertsSummary,
          uxFriction: overview.uxFriction
        });

        const evidence: EvidenceItem[] = [
          {
            type: 'event',
            id: 'project_overview',
            title: 'Project Overview',
            url: `/dashboard`,
            summary: `Project totals: ${overview.totals.events24h.toLocaleString()} events in last 24h, ${overview.totals.users.toLocaleString()} active users.`
          }
        ];

        return {
          success: true,
          summary: `Project overview retrieved: ${overview.totals.events24h} events (24h), ${overview.totals.users} users.`,
          data: sanitized,
          evidence
        };
      }
    });

    // 2. List Funnels
    this.register({
      name: 'list_funnels',
      description: 'List all funnels configured in this project with their step names.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (ctx) => {
        if (!this.funnels) throw new Error('Funnels service unavailable');
        const list = await this.funnels.list(ctx.user, ctx.projectId);
        const funnels = list.funnels.map((f) => ({
          id: f.id,
          name: f.name,
          stepCount: f.stepCount,
          steps: f.steps?.map((s) => s.label || s.eventName) || []
        }));

        const evidence: EvidenceItem[] = funnels.map((f) => ({
          type: 'funnel',
          id: f.id,
          title: f.name,
          url: `/dashboard/funnels?funnelId=${encodeURIComponent(f.id)}`,
          summary: `${f.name} (${f.stepCount} steps)`
        }));

        return {
          success: true,
          summary: `Found ${funnels.length} funnels.`,
          data: { funnels },
          evidence
        };
      }
    });

    // 3. Get Funnel Details & Performance
    this.register({
      name: 'get_funnel',
      description: 'Get conversion rates, step drop-off numbers, and duration metrics for a specific funnel.',
      parameters: {
        type: 'object',
        properties: {
          funnelId: { type: 'string', description: 'The unique ID of the funnel' },
          days: { type: 'string', description: 'Time window in days (e.g. "7", "14", "30"). Default "7".' }
        },
        required: ['funnelId']
      },
      execute: async (ctx, args) => {
        if (!this.funnels) throw new Error('Funnels service unavailable');
        const funnelId = String(args.funnelId);
        const days = args.days ? String(args.days) : '7';
        const results = await this.funnels.getResults(ctx.user, funnelId, days, ctx.projectId);

        const steps = results.steps.map((s) => ({
          name: s.label || s.eventName,
          eventName: s.eventName,
          count: s.count,
          conversionFromStart: s.conversionFromStart,
          conversionFromPrevious: s.conversionFromPrevious,
          droppedFromPrevious: s.droppedFromPrevious
        }));

        const firstStep = steps[0]?.count || 0;
        const lastStep = steps[steps.length - 1]?.count || 0;
        const overallConversion = firstStep > 0 ? (lastStep / firstStep) * 100 : 0;

        const data = {
          funnelName: results.funnel.name,
          overallConversionRatePercent: Math.round(overallConversion * 10) / 10,
          totalStarted: firstStep,
          totalCompleted: lastStep,
          timeWindowDays: results.days,
          steps
        };

        const evidence: EvidenceItem[] = [
          {
            type: 'funnel',
            id: funnelId,
            title: results.funnel.name,
            url: `/dashboard/funnels?funnelId=${encodeURIComponent(funnelId)}`,
            summary: `Conversion: ${data.overallConversionRatePercent}% (${lastStep}/${firstStep} completed)`,
            data
          }
        ];

        return {
          success: true,
          summary: `Funnel "${results.funnel.name}": ${data.overallConversionRatePercent}% overall conversion.`,
          data: this.sanitizer.sanitizeData(data),
          evidence
        };
      }
    });

    // 4. Get Event Trends
    this.register({
      name: 'get_event_trends',
      description: 'Get time series frequency and unique user trends for a given event name.',
      parameters: {
        type: 'object',
        properties: {
          event: { type: 'string', description: 'The event name to analyze' },
          days: { type: 'string', description: 'Number of days to look back (default "7")' },
          interval: { type: 'string', enum: ['hour', 'day', 'week'], description: 'Grouping interval (default "day")' }
        },
        required: ['event']
      },
      execute: async (ctx, args) => {
        if (!this.analytics) throw new Error('Analytics service unavailable');
        const event = String(args.event);
        const days = args.days ? String(args.days) : '7';
        const interval = (args.interval as any) || 'day';

        const trends = await this.analytics.getTrends(ctx.user, {
          event,
          days,
          interval,
          projectId: ctx.projectId
        });

        const series = trends.series.map((s) => ({
          key: s.key,
          totalCount: s.points.reduce((acc, p) => acc + p.total, 0),
          uniqueUsers: s.points.reduce((acc, p) => acc + p.uniques, 0),
          points: s.points.slice(-14)
        }));

        const totalOccurrences = series.reduce((acc, s) => acc + s.totalCount, 0);

        const evidence: EvidenceItem[] = [
          {
            type: 'event',
            id: event,
            title: `Event: ${event}`,
            url: `/dashboard/insights/trends?event=${encodeURIComponent(event)}`,
            summary: `${totalOccurrences.toLocaleString()} occurrences in last ${days} days.`
          }
        ];

        return {
          success: true,
          summary: `Event "${event}" had ${totalOccurrences} occurrences in the last ${days} days.`,
          data: this.sanitizer.sanitizeData({ event, days, interval, series }),
          evidence
        };
      }
    });

    // 5. Get Error Trends & Issues
    this.register({
      name: 'get_error_trends',
      description: 'Get the top error issues, frequencies, and recent trends.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'string', description: 'Lookback window in days (default "14")' }
        }
      },
      execute: async (ctx, args) => {
        if (!this.errors) throw new Error('Errors service unavailable');
        const days = args.days ? String(args.days) : '14';
        const result = await this.errors.listIssues(ctx.user, days, ctx.projectId);

        const issues = result.issues.slice(0, 10).map((issue) => ({
          type: issue.type,
          message: issue.message,
          occurrences: issue.occurrences,
          affectedUsers: issue.users,
          affectedSessions: issue.sessions,
          firstSeen: issue.firstSeen,
          lastSeen: issue.lastSeen
        }));

        const evidence: EvidenceItem[] = issues.map((issue) => ({
          type: 'error',
          id: `${issue.type}:${issue.message}`,
          title: `${issue.type}: ${issue.message.slice(0, 50)}`,
          url: `/dashboard/errors?type=${encodeURIComponent(issue.type)}&message=${encodeURIComponent(issue.message)}`,
          summary: `${issue.occurrences} occurrences across ${issue.affectedUsers} users.`
        }));

        return {
          success: true,
          summary: `Found ${issues.length} major error issues in the last ${days} days.`,
          data: this.sanitizer.sanitizeData({ days, totalIssues: result.issues.length, topIssues: issues }),
          evidence
        };
      }
    });

    // 6. Get Error Issue Detail
    this.register({
      name: 'get_error_issue',
      description: 'Get deep diagnostic details on a specific error (browser/OS breakdown, affected users, sample stack traces).',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Error type (e.g. "TypeError", "APIError")' },
          message: { type: 'string', description: 'The exact error message string' },
          days: { type: 'string', description: 'Lookback window in days (default "14")' }
        },
        required: ['type', 'message']
      },
      execute: async (ctx, args) => {
        if (!this.errors) throw new Error('Errors service unavailable');
        const type = String(args.type);
        const message = String(args.message);
        const days = args.days ? String(args.days) : '14';

        const detail = await this.errors.getIssue(ctx.user, {
          type,
          message,
          days,
          projectId: ctx.projectId
        });

        const samples = detail.samples.slice(0, 5).map((s) => ({
          id: s.id,
          browser: s.browser,
          os: s.os,
          country: s.country,
          actor: s.actor,
          occurredAt: s.occurredAt,
          stackPreview: s.stack ? s.stack.split('\n').slice(0, 4).join('\n') : null
        }));

        const data = {
          issue: detail.issue,
          totals: detail.totals,
          browsers: detail.browsers,
          operatingSystems: detail.operatingSystems,
          recentSamples: samples
        };

        const evidence: EvidenceItem[] = [
          {
            type: 'error',
            id: `${type}:${message}`,
            title: `${type}: ${message.slice(0, 50)}`,
            url: `/dashboard/errors?type=${encodeURIComponent(type)}&message=${encodeURIComponent(message)}`,
            summary: `${detail.totals.occurrences} occurrences affecting ${detail.totals.users} users.`,
            data
          }
        ];

        return {
          success: true,
          summary: `Error "${type}: ${message}" occurred ${detail.totals.occurrences} times affecting ${detail.totals.users} users.`,
          data: this.sanitizer.sanitizeData(data),
          evidence
        };
      }
    });

    // 7. Get API Telemetry & Performance
    this.register({
      name: 'get_api_performance',
      description: 'Get API latency, error rate, p95 response times, and failing endpoints.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'string', description: 'Lookback window in days (default "7")' }
        }
      },
      execute: async (ctx, args) => {
        if (!this.analytics) throw new Error('Analytics service unavailable');
        const days = args.days ? String(args.days) : '7';
        const perf = await this.analytics.getApiPerformance(ctx.user, days, ctx.projectId);

        const failingEndpoints = (perf.highestError || []).map((ep: any) => ({
          method: ep.method,
          path: ep.path,
          count: ep.count,
          avgDurationMs: Math.round(ep.avg || 0),
          p95Ms: Math.round(ep.p95 || 0),
          errors: ep.errors || 0
        }));

        const slowEndpoints = (perf.highestLatency || []).map((ep: any) => ({
          method: ep.method,
          path: ep.path,
          count: ep.count,
          avgDurationMs: Math.round(ep.avg || 0),
          p95Ms: Math.round(ep.p95 || 0)
        }));

        const evidence: EvidenceItem[] = failingEndpoints.map((ep: any) => ({
          type: 'api_endpoint',
          id: `${ep.method} ${ep.path}`,
          title: `${ep.method} ${ep.path}`,
          url: `/dashboard/monitoring?path=${encodeURIComponent(ep.path)}`,
          summary: `${ep.count} requests, ${ep.errors} errors, p95 ${ep.p95Ms}ms`
        }));

        return {
          success: true,
          summary: `API performance: ${perf.summary?.totalRequests || 0} total requests, ${perf.summary?.errorCount || 0} errors (p95: ${perf.summary?.p95 || 0}ms).`,
          data: this.sanitizer.sanitizeData({
            summary: perf.summary,
            failingEndpoints,
            slowEndpoints
          }),
          evidence
        };
      }
    });

    // 8. List Feature Flags
    this.register({
      name: 'list_feature_flags',
      description: 'List feature flags, rollout percentages, and enabled status.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (ctx) => {
        if (!this.flags) throw new Error('Feature flags service unavailable');
        const result = await this.flags.list(ctx.user, ctx.projectId);
        const flags = result.flags.map((f: any) => ({
          id: f.id,
          key: f.key,
          name: f.name,
          enabled: f.enabled,
          rolloutPercentage: f.rolloutPercentage,
          type: f.flagType || 'boolean',
          updatedAt: f.updatedAt
        }));

        const evidence: EvidenceItem[] = flags.map((f: any) => ({
          type: 'feature_flag',
          id: f.id,
          title: `Flag: ${f.name || f.key}`,
          url: `/dashboard/flags/${encodeURIComponent(f.id)}`,
          summary: `${f.enabled ? 'Enabled' : 'Disabled'} (${f.rolloutPercentage}% rollout)`
        }));

        return {
          success: true,
          summary: `Found ${flags.length} feature flags.`,
          data: { flags },
          evidence
        };
      }
    });

    // 9. Get Feature Flag Details & Exposures
    this.register({
      name: 'get_feature_flag',
      description: 'Get targeting rules, evaluation trends, and exposure analytics for a feature flag.',
      parameters: {
        type: 'object',
        properties: {
          flagId: { type: 'string', description: 'The unique ID of the feature flag' }
        },
        required: ['flagId']
      },
      execute: async (ctx, args) => {
        if (!this.flags) throw new Error('Feature flags service unavailable');
        const flagId = String(args.flagId);
        const result = await this.flags.get(ctx.user, flagId, ctx.projectId);
        const flag = result.flag;

        const data = {
          flag: {
            id: flag.id,
            key: flag.key,
            name: flag.name,
            enabled: flag.enabled,
            rolloutPercentage: flag.rolloutPercentage,
            description: flag.description,
            environment: flag.environment,
            targeting: flag.targeting,
            targetingGroups: flag.targetingGroups
          }
        };

        const evidence: EvidenceItem[] = [
          {
            type: 'feature_flag',
            id: flag.id,
            title: flag.name || flag.key,
            url: `/dashboard/flags/${encodeURIComponent(flag.id)}`,
            summary: `Flag "${flag.key}": ${flag.enabled ? 'Enabled' : 'Disabled'} at ${flag.rolloutPercentage}% rollout.`,
            data
          }
        ];

        return {
          success: true,
          summary: `Flag "${flag.key}" is ${flag.enabled ? 'ENABLED' : 'DISABLED'} with ${flag.rolloutPercentage}% rollout.`,
          data: this.sanitizer.sanitizeData(data),
          evidence
        };
      }
    });

    // 10. Get User Profile
    this.register({
      name: 'get_user_profile',
      description: 'Get user summary, traits, session count, device, and last seen details for a specific user ID.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID or distinct ID' }
        },
        required: ['userId']
      },
      execute: async (ctx, args) => {
        if (!this.users) throw new Error('Users service unavailable');
        const userId = String(args.userId);
        const profile = await this.users.getPerson(ctx.user, userId, ctx.projectId);

        const maskEmail = (email?: string | null) => {
          if (!email) return null;
          const [user, domain] = email.split('@');
          if (!domain) return '***';
          return `${user.slice(0, 1)}***@${domain}`;
        };

        const safeTraits = this.sanitizer.sanitizeData(profile.traitsPreview || {});

        const data = {
          id: profile.id,
          displayName: profile.displayName,
          emailMasked: profile.emailMasked || maskEmail(profile.email),
          eventCount: profile.eventCount,
          sessionCount: profile.sessionCount,
          firstSeenAt: profile.firstSeenAt,
          lastSeenAt: profile.lastSeenAt,
          lastDevice: {
            browser: profile.lastBrowser,
            os: profile.lastOs,
            deviceType: profile.lastDeviceType,
            country: profile.lastCountry,
            city: profile.lastCity
          },
          traits: safeTraits
        };

        const evidence: EvidenceItem[] = [
          {
            type: 'user',
            id: profile.id,
            title: profile.displayName || `User ${profile.id.slice(0, 8)}`,
            url: `/dashboard/users/${encodeURIComponent(profile.id)}`,
            summary: `${profile.displayName} — ${profile.eventCount} events, ${profile.sessionCount} sessions.`
          }
        ];

        return {
          success: true,
          summary: `User ${profile.displayName}: ${profile.eventCount} events, last active ${profile.lastSeenAt}.`,
          data: this.sanitizer.sanitizeData(data),
          evidence
        };
      }
    });

    // 11. Get User Timeline
    this.register({
      name: 'get_user_timeline',
      description: 'Get the chronological activity timeline (recent events and actions) for a specific user.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'User ID or distinct ID' },
          limit: { type: 'number', description: 'Maximum number of timeline items (default 20, max 30)' }
        },
        required: ['userId']
      },
      execute: async (ctx, args) => {
        if (!this.users) throw new Error('Users service unavailable');
        const userId = String(args.userId);
        const limit = Math.min(Number(args.limit) || 20, 30);

        const timeline = await this.users.getTimeline(ctx.user, userId, {
          projectId: ctx.projectId,
          limit: String(limit)
        });

        const items = timeline.items.map((e) => ({
          id: e.id,
          eventName: e.eventName,
          sessionId: e.sessionId,
          occurredAt: e.occurredAt,
          properties: this.sanitizer.sanitizeData(e.properties)
        }));

        const evidence: EvidenceItem[] = [
          {
            type: 'user',
            id: userId,
            title: `User Timeline: ${userId.slice(0, 12)}`,
            url: `/dashboard/users/${encodeURIComponent(userId)}`,
            summary: `${items.length} recent timeline events.`
          }
        ];

        return {
          success: true,
          summary: `Retrieved ${items.length} timeline events for user.`,
          data: { userId, count: items.length, items },
          evidence
        };
      }
    });

    // 12. Get Session Replays
    this.register({
      name: 'get_session_replays',
      description: 'Search available session replays and playback metadata.',
      parameters: {
        type: 'object',
        properties: {
          userId: { type: 'string', description: 'Optional filter by user ID' },
          sessionId: { type: 'string', description: 'Optional filter by session ID' },
          limit: { type: 'string', description: 'Max replays to return (default "10")' }
        }
      },
      execute: async (ctx, args) => {
        if (!this.replay) throw new Error('Replay service unavailable');
        const limit = args.limit ? String(args.limit) : '10';
        const userId = args.userId ? String(args.userId) : undefined;
        const sessionId = args.sessionId ? String(args.sessionId) : undefined;

        let replays: any[] = [];
        try {
          const res = await this.replay.list(ctx.user, {
            projectId: ctx.projectId,
            userId,
            sessionId,
            limit
          });
          replays = (res.replays || []).map((r: any) => ({
            id: r.id,
            sessionId: r.sessionId,
            durationSeconds: r.durationSeconds || (r.startedAt && r.endedAt ? Math.round((new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000) : 0),
            eventCount: r.eventCount,
            startedAt: r.startedAt,
            endedAt: r.endedAt
          }));
        } catch {
          // Replay might be Pro-gated or disabled
        }

        const evidence: EvidenceItem[] = replays.map((r) => ({
          type: 'session_replay',
          id: r.id,
          title: `Replay: Session ${r.sessionId ? r.sessionId.slice(0, 8) : r.id.slice(0, 8)}`,
          url: `/dashboard/replays/${encodeURIComponent(r.id)}`,
          summary: `Duration: ${r.durationSeconds}s, ${r.eventCount} events.`
        }));

        return {
          success: true,
          summary: `Found ${replays.length} matching session replays.`,
          data: { count: replays.length, replays },
          evidence
        };
      }
    });

    // 13. Get Webhooks Health
    this.register({
      name: 'get_webhook_health',
      description: 'Get webhook endpoints status, failure counts, and delivery history.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (ctx) => {
        if (!this.webhooks) throw new Error('Webhooks service unavailable');
        const res = await this.webhooks.list(ctx.user, ctx.projectId);
        const webhooks = res.webhooks.map((w: any) => ({
          id: w.id,
          name: w.name,
          url: w.url,
          status: w.status,
          failureCount: w.failureCount,
          lastStatus: w.lastStatus,
          lastDeliveredAt: w.lastDeliveredAt
        }));

        const evidence: EvidenceItem[] = webhooks.map((w) => ({
          type: 'webhook',
          id: w.id,
          title: `Webhook: ${w.name}`,
          url: `/dashboard/webhooks/${encodeURIComponent(w.id)}`,
          summary: `Status: ${w.status}, Failures: ${w.failureCount}`
        }));

        return {
          success: true,
          summary: `Found ${webhooks.length} webhooks. Failing: ${webhooks.filter((w) => w.status === 'failing' || w.failureCount > 0).length}.`,
          data: { webhooks },
          evidence
        };
      }
    });

    // 14. Get Alerts Health
    this.register({
      name: 'get_alerts',
      description: 'Get configured metric alerts, triggers, and current firing/healthy statuses.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (ctx) => {
        if (!this.alerts) throw new Error('Alerts service unavailable');
        const res = await this.alerts.list(ctx.user, ctx.projectId);
        const alerts = res.alerts.map((a: any) => ({
          id: a.id,
          name: a.name,
          eventName: a.eventName,
          condition: a.condition,
          threshold: a.threshold,
          lastStatus: a.lastStatus,
          lastValue: a.lastValue,
          lastEvaluatedAt: a.lastEvaluatedAt
        }));

        const firing = alerts.filter((a) => a.lastStatus === 'firing');

        const evidence: EvidenceItem[] = alerts.map((a) => ({
          type: 'alert',
          id: a.id,
          title: `Alert: ${a.name}`,
          url: `/dashboard/alerts`,
          summary: `Status: ${a.lastStatus} (Current: ${a.lastValue ?? 'N/A'}, Threshold: ${a.threshold})`
        }));

        return {
          success: true,
          summary: `Found ${alerts.length} alerts (${firing.length} currently FIRING).`,
          data: { alerts, firingCount: firing.length },
          evidence
        };
      }
    });

    // 15. Get Retention Cohorts
    this.register({
      name: 'get_retention',
      description: 'Get weekly retention cohort matrices for the project.',
      parameters: {
        type: 'object',
        properties: {
          weeks: { type: 'string', description: 'Number of weeks to analyze (default "8")' }
        }
      },
      execute: async (ctx, args) => {
        if (!this.analytics) throw new Error('Analytics service unavailable');
        const weeks = args.weeks ? String(args.weeks) : '8';
        const retention = await this.analytics.getRetention(ctx.user, {
          weeks,
          projectId: ctx.projectId
        });

        const cohorts = (retention.cohorts || []).slice(0, 8).map((c: any) => ({
          cohort: c.cohort,
          size: c.size,
          retentionPercentages: c.retention
        }));

        const evidence: EvidenceItem[] = [
          {
            type: 'retention',
            id: 'retention_matrix',
            title: 'User Retention Matrix',
            url: `/dashboard/insights/retention`,
            summary: `Weekly retention across ${cohorts.length} cohorts.`
          }
        ];

        return {
          success: true,
          summary: `Retention matrix retrieved across ${cohorts.length} cohorts.`,
          data: { weeks, cohorts },
          evidence
        };
      }
    });

    // 16. Get Cohorts Definitions
    this.register({
      name: 'get_cohorts',
      description: 'Get user segment / cohort definitions configured in this project.',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async (ctx) => {
        if (!this.cohorts) throw new Error('Cohorts service unavailable');
        const res = await this.cohorts.list(ctx.user, ctx.projectId);
        const cohortList = res.cohorts.map((c) => ({
          id: c.id,
          name: c.name,
          filtersCount: c.filters.length,
          createdAt: c.createdAt
        }));

        const evidence: EvidenceItem[] = cohortList.map((c) => ({
          type: 'cohort',
          id: c.id,
          title: `Cohort: ${c.name}`,
          url: `/dashboard/cohorts`,
          summary: `${c.name} (${c.filtersCount} conditions)`
        }));

        return {
          success: true,
          summary: `Found ${cohortList.length} saved user cohorts.`,
          data: { cohorts: cohortList },
          evidence
        };
      }
    });
    // Product guide: how to use TraceIQ itself (no project data).
    this.register({
      name: 'get_product_guide',
      description:
        'How to use TraceIQ itself: setup steps, where a feature lives in the dashboard, and the docs page. Use for "how do I…", "where is…", "what is…" questions about TraceIQ features (synthetic monitors, alerts, funnels, flags, replays, errors, dashboards, CLI, billing, team and more). Does not read project data.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The feature or task the user asked about, e.g. "create a synthetic monitor".' }
        },
        required: ['query']
      },
      execute: async (_ctx, args) => {
        const query = String(args.query ?? '').slice(0, 300);
        const topics = searchProductGuide(query);
        if (topics.length === 0) {
          return {
            success: true,
            summary: 'No matching guide topic; listing available topics.',
            data: { matches: [], availableTopics: PRODUCT_GUIDE.map((t) => t.title) },
            evidence: []
          };
        }

        const evidence: EvidenceItem[] = topics.flatMap((t) => {
          const items: EvidenceItem[] = [
            { type: 'guide', id: `guide_${t.id}`, title: t.title, url: t.route, summary: t.summary }
          ];
          if (t.docs) {
            items.push({ type: 'guide', id: `docs_${t.id}`, title: `Docs: ${t.title}`, url: t.docs, summary: 'Read the full guide in the docs.' });
          }
          return items;
        });

        return {
          success: true,
          summary: `Found guide: ${topics.map((t) => t.title).join(', ')}.`,
          data: {
            matches: topics.map((t) => ({
              title: t.title,
              summary: t.summary,
              steps: t.steps,
              dashboardRoute: t.route,
              docsUrl: t.docs ?? null,
              relatedTopics: (t.related ?? [])
                .map((id) => PRODUCT_GUIDE.find((g) => g.id === id)?.title)
                .filter(Boolean)
            }))
          },
          evidence
        };
      }
    });
  }

  private register(tool: TraceIQToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  getTools(): TraceIQToolDefinition[] {
    return Array.from(this.tools.values());
  }

  getToolDefinitionsForAi(): AiToolDefinition[] {
    return Array.from(this.tools.values()).map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters
      }
    }));
  }

  async executeTool(
    name: string,
    context: ToolExecutionContext,
    rawArgs: string | Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        summary: `Tool "${name}" is not recognized or available.`,
        data: null,
        evidence: [],
        error: `Tool ${name} not found in TraceIQ tool registry.`
      };
    }

    let parsedArgs: Record<string, unknown> = {};
    if (typeof rawArgs === 'string') {
      try {
        parsedArgs = JSON.parse(rawArgs);
      } catch {
        parsedArgs = {};
      }
    } else if (typeof rawArgs === 'object' && rawArgs !== null) {
      parsedArgs = rawArgs;
    }

    try {
      this.logger.log(`Executing Ask TraceIQ tool: ${name} for project=${context.projectId}`);
      return await tool.execute(context, parsedArgs);
    } catch (err: any) {
      this.logger.warn(`Tool ${name} execution failed: ${err?.message || err}`);
      return {
        success: false,
        summary: `Tool "${name}" execution failed: ${err?.message || 'Internal error'}`,
        data: null,
        evidence: [],
        error: err?.message || String(err)
      };
    }
  }
}
