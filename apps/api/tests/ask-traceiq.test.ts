import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToolRegistryService } from '../src/modules/ai/tools/tool-registry.service';
import { PRODUCT_GUIDE, searchProductGuide } from '../src/modules/ai/tools/product-guide';
import { AiSanitizerService } from '../src/modules/ai/context/ai-sanitizer.service';
import { AskOrchestratorService } from '../src/modules/ai/ask/ask-orchestrator.service';
import { AskService } from '../src/modules/ai/ask/ask.service';
import { ConversationService } from '../src/modules/ai/ask/conversation.service';
import { AiModelPolicyService } from '../src/modules/ai/models/ai-model-policy.service';
import { AiRunsService } from '../src/modules/ai/usage/ai-runs.service';
import { CencoriProvider } from '../src/modules/ai/providers/cencori.provider';
import { DashboardUser } from '../src/modules/auth/auth.service';
import { CLOUD_PLAN_CATALOG } from '../src/modules/billing/plan-catalog';
import { UsageService } from '../src/modules/billing/usage.service';
import { EntitlementService } from '../src/modules/billing/entitlement.service';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';

describe('Ask TraceIQ - Plan Catalog & Entitlements', () => {
  it('enforces canonical Free (3) and Pro (100) investigations allowance', () => {
    expect(CLOUD_PLAN_CATALOG.free.limits.aiInsightsPerMonth).toBe(3);
    expect(CLOUD_PLAN_CATALOG.pro.limits.aiInsightsPerMonth).toBe(100);
  });
});

describe('Ask TraceIQ - Tool Registry & Tenant Security', () => {
  let sanitizer: AiSanitizerService;
  let toolRegistry: ToolRegistryService;

  const mockAnalytics = {
    getOverview: vi.fn().mockResolvedValue({
      totals: { events: 1000, events24h: 500, events1h: 20, users: 150, sessions: 200 },
      apiTelemetry: { totalRequests: 500, errorRate: 2, p95: 120 },
      topErrors: [{ type: 'TypeError', message: 'Cannot read property of undefined', occurrences: 12, users: 4 }]
    }),
    getTrends: vi.fn().mockResolvedValue({
      series: [{ key: 'checkout_click', points: [{ total: 100, uniques: 80 }] }]
    }),
    getApiPerformance: vi.fn().mockResolvedValue({
      summary: { totalRequests: 1000, errorCount: 50, errorRate: 5, p95: 250, avg: 45 },
      highestError: [{ method: 'POST', path: '/checkout', count: 200, errors: 40, p95: 300 }]
    })
  };

  const mockFunnels = {
    getResults: vi.fn().mockResolvedValue({
      funnel: { id: 'funnel_1', name: 'Purchase Flow' },
      days: 7,
      steps: [
        { label: 'Cart View', eventName: 'cart_view', count: 1000, conversionFromStart: 1, conversionFromPrevious: 1, droppedFromPrevious: 0 },
        { label: 'Payment Completed', eventName: 'payment_success', count: 420, conversionFromStart: 0.42, conversionFromPrevious: 0.42, droppedFromPrevious: 580 }
      ]
    }),
    list: vi.fn().mockResolvedValue({
      funnels: [{ id: 'funnel_1', name: 'Purchase Flow', stepCount: 2 }]
    })
  };

  beforeEach(() => {
    sanitizer = new AiSanitizerService();
    toolRegistry = new ToolRegistryService(
      sanitizer,
      mockFunnels as any,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      mockAnalytics as any
    );
  });

  it('registers expected read-only product tools', () => {
    const tools = toolRegistry.getTools();
    expect(tools.length).toBeGreaterThanOrEqual(10);
    const names = tools.map((t) => t.name);
    expect(names).toContain('get_overview');
    expect(names).toContain('get_funnel');
    expect(names).toContain('list_funnels');
    expect(names).toContain('get_event_trends');
    expect(names).toContain('get_api_performance');
  });

  it('answers how-to questions from the product guide with dashboard and docs links', async () => {
    const context = {
      user: { id: 'usr_alice', email: 'alice@example.com' } as DashboardUser,
      organizationId: 'org_legit',
      projectId: 'proj_legit'
    };

    const result = await toolRegistry.executeTool('get_product_guide', context, {
      query: 'How do I set up a synthetic monitor?'
    });

    expect(result.success).toBe(true);
    const data = result.data as { matches: Array<{ title: string; steps: string[]; dashboardRoute: string; docsUrl: string | null }> };
    expect(data.matches[0].title).toBe('Create a synthetic monitor');
    expect(data.matches[0].steps.length).toBeGreaterThan(2);
    expect(data.matches[0].dashboardRoute).toBe('/dashboard/synthetic-monitors/new');
    expect(result.evidence.map((e) => e.url)).toEqual(
      expect.arrayContaining(['/dashboard/synthetic-monitors/new', '/docs?page=features'])
    );
    expect(result.evidence.every((e) => e.type === 'guide')).toBe(true);
  });

  it('routes common how-to questions to the right guide topic', () => {
    expect(searchProductGuide('send alerts to slack')[0].id).toBe('alerts');
    expect(searchProductGuide('invite a teammate')[0].id).toBe('team');
    expect(searchProductGuide('turn on session replay')[0].id).toBe('session-replay');
    expect(searchProductGuide('roll out a feature flag to 10%')[0].id).toBe('feature-flags');
    expect(searchProductGuide('install the sdk')[0].id).toBe('setup');
    expect(searchProductGuide('qwertyuiop')).toEqual([]);
  });

  it('links every guide topic to a dashboard route and only to real docs pages', () => {
    const docsPages = new Set([
      'welcome', 'quickstart', 'methods', 'config', 'autocapture', 'self-hosting', 'web-analytics', 'session-replay',
      'flags', 'alerts', 'dashboards', 'public-sharing', 'api-performance', 'logs', 'webhooks', 'export', 'events',
      'features', 'ingestion', 'cli', 'mcp'
    ]);
    for (const topic of PRODUCT_GUIDE) {
      expect(topic.route.startsWith('/dashboard')).toBe(true);
      if (topic.docs) {
        expect(docsPages.has(topic.docs.replace('/docs?page=', ''))).toBe(true);
      }
    }
  });

  it('strictly binds tool execution to context project without tenant switching', async () => {
    const context = {
      user: { id: 'usr_alice', email: 'alice@example.com' } as DashboardUser,
      organizationId: 'org_legit',
      projectId: 'proj_legit'
    };

    // Attempt injection in arguments trying to read a foreign project
    await toolRegistry.executeTool('get_funnel', context, {
      funnelId: 'funnel_1',
      projectId: 'proj_malicious_attacker_target'
    });

    expect(mockFunnels.getResults).toHaveBeenCalledWith(
      context.user,
      'funnel_1',
      '7',
      'proj_legit' // Verified: bound to context.projectId, NOT attacker parameter
    );
  });

  it('sanitizes customer emails, tokens, and IPs before returning tool data to AI', async () => {
    const mockErrorsService = {
      listIssues: vi.fn().mockResolvedValue({
        issues: [
          {
            type: 'AuthError',
            message: 'Invalid Bearer eyJhbGciOiJIUzI1NiJ9.secretKey for user sensitive@customer.com at 192.168.1.10',
            occurrences: 5,
            users: 2,
            sessions: 2
          }
        ]
      })
    };

    const registryWithErrors = new ToolRegistryService(
      sanitizer,
      undefined,
      mockErrorsService as any
    );

    const context = {
      user: { id: 'usr_1', email: 'u@u.com' } as DashboardUser,
      organizationId: 'org_1',
      projectId: 'proj_1'
    };

    const result = await registryWithErrors.executeTool('get_error_trends', context, {});
    expect(result.success).toBe(true);

    const stringified = JSON.stringify(result.data);
    expect(stringified).not.toContain('sensitive@customer.com');
    expect(stringified).not.toContain('192.168.1.10');
    expect(stringified).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(stringified).toContain('[REDACTED_EMAIL]');
    expect(stringified).toContain('[REDACTED_IP]');
  });
});

describe('Ask TraceIQ - Orchestrator & Bounded Tool Calling', () => {
  let sanitizer: AiSanitizerService;
  let toolRegistry: ToolRegistryService;
  let modelPolicy: AiModelPolicyService;
  let aiRuns: AiRunsService;

  beforeEach(() => {
    sanitizer = new AiSanitizerService();
    toolRegistry = new ToolRegistryService(sanitizer);
    modelPolicy = new AiModelPolicyService();
    aiRuns = { recordRun: vi.fn() } as unknown as AiRunsService;
  });

  it('executes tool-calling loop and returns synthesized evidence-backed answer with findings', async () => {
    const mockProvider = {
      isConfigured: vi.fn().mockReturnValue(true),
      chat: vi
        .fn()
        // Round 1: Model requests a tool call
        .mockResolvedValueOnce({
          content: '',
          toolCalls: [
            {
              id: 'call_1',
              type: 'function',
              function: { name: 'get_overview', arguments: '{}' }
            }
          ],
          finishReason: 'tool_calls',
          requestedModel: 'gpt-4o',
          routedModel: 'gemini-2.5-pro',
          inputTokens: 100,
          outputTokens: 20,
          latencyMs: 300
        })
        // Round 2: Model synthesizes final answer with follow-up suggestions
        .mockResolvedValueOnce({
          content: `OBSERVED: Checkout conversion dropped 7.2% today. POST /checkout errors increased 31%.
CORRELATED: Users exposed to checkout-v2 experienced higher failure rates.
HYPOTHESIS: Gateway timeout during peak volume may be causing drop-offs.

SUGGESTED_QUESTIONS:
- Only analyze mobile users
- Compare this week to last week`,
          requestedModel: 'gpt-4o',
          routedModel: 'gemini-2.5-pro',
          inputTokens: 300,
          outputTokens: 80,
          latencyMs: 500
        })
    } as unknown as CencoriProvider;

    const orchestrator = new AskOrchestratorService(
      mockProvider,
      modelPolicy,
      aiRuns,
      toolRegistry
    );

    const progressEvents: string[] = [];
    const result = await orchestrator.runInvestigation({
      investigationId: 'inv_123',
      context: {
        user: { id: 'usr_1', email: 'test@example.com' } as DashboardUser,
        organizationId: 'org_1',
        projectId: 'proj_1'
      },
      question: 'Why did checkout conversion fall today?',
      onProgress: (p) => progressEvents.push(p.step)
    });

    expect(result.answer).toContain('OBSERVED: Checkout conversion dropped 7.2%');
    expect(result.findings.length).toBe(3);
    expect(result.findings[0].classification).toBe('observed');
    expect(result.findings[1].classification).toBe('correlated');
    expect(result.findings[2].classification).toBe('hypothesis');
    expect(result.suggestedFollowups).toEqual([
      'Only analyze mobile users',
      'Compare this week to last week'
    ]);
    expect(result.toolCallsCount).toBe(1);
    expect(result.model).toBe('gemini-2.5-pro');
    expect(aiRuns.recordRun).toHaveBeenCalledTimes(2);
    expect(progressEvents.length).toBeGreaterThan(0);
  });
});

describe('Ask TraceIQ - Quota Concurrency & Atomic Reservation Hardening', () => {
  it('correctly rejects concurrent requests when usage + active reservations reach quota limit', async () => {
    const mockConsumed = 2; // Free plan: limit is 3, already consumed 2
    let activeReservations = 0;

    const mockEntitlements = {
      getSnapshot: vi.fn().mockImplementation(() => Promise.resolve({
        deploymentMode: 'cloud',
        plan: 'free',
        limits: { aiInsights: 3 },
        usage: { aiInsights: mockConsumed }
      }))
    } as unknown as EntitlementService;

    const mockExecutor = {
      query: vi.fn().mockImplementation((queryText: string) => {
        if (queryText.includes('pg_advisory_xact_lock')) {
          return Promise.resolve({ rows: [] });
        }
        if (queryText.includes('UPDATE ai_investigations') && queryText.includes('SET quota_reserved = true')) {
          activeReservations += 1;
          return Promise.resolve({ rows: [] });
        }
        if (queryText.includes('organization_usage_monthly')) {
          return Promise.resolve({
            rows: [{ consumed: String(mockConsumed), reserved: String(activeReservations) }]
          });
        }
        return Promise.resolve({ rows: [] });
      })
    };

    const usageService = new UsageService(mockEntitlements);

    // Request 1 tries to reserve remaining slot (consumed: 2, reserved: 0, limit: 3) -> SUCCESS
    const res1 = await usageService.reserveAskInvestigation(
      mockExecutor as any,
      'org_test',
      'inv_1',
      '2026-09',
      1
    );
    expect(res1.allowed).toBe(true);

    // Request 2 tries to reserve (consumed: 2, reserved: 1, limit: 3) -> REJECTED (LIMIT REACHED)
    await expect(
      usageService.reserveAskInvestigation(
        mockExecutor as any,
        'org_test',
        'inv_2',
        '2026-09',
        1
      )
    ).rejects.toThrow(ForbiddenException);
  });

  it('releases quota reservation on failed investigation without charging monthly usage', async () => {
    const mockOrchestrator = {
      runInvestigation: vi.fn().mockRejectedValue(new ServiceUnavailableException('Cencori upstream 503'))
    } as unknown as AskOrchestratorService;

    const mockConversations = {
      getOrCreateConversation: vi.fn().mockResolvedValue({ id: 'conv_1' }),
      createInvestigation: vi.fn().mockResolvedValue({ id: 'inv_fail_1' }),
      recordMessage: vi.fn(),
      getConversationMessages: vi.fn().mockResolvedValue([]),
      updateInvestigation: vi.fn(),
      getInvestigationByIdempotencyKey: vi.fn().mockResolvedValue(null)
    } as unknown as ConversationService;

    const mockUsage = {
      reserveAskInvestigation: vi.fn().mockResolvedValue({ allowed: true }),
      chargeAskInvestigation: vi.fn(),
      releaseAskInvestigation: vi.fn().mockResolvedValue(undefined)
    };

    const mockDatabase = {
      transaction: vi.fn().mockImplementation(async (callback) => {
        return callback({});
      }),
      query: vi.fn().mockResolvedValue({ rows: [] })
    };

    const service = new AskService(
      mockOrchestrator,
      mockConversations,
      { isAiEnabled: () => true } as any,
      { requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }) } as any,
      {} as any,
      mockUsage as any,
      mockDatabase as any
    );

    const user: DashboardUser = { id: 'usr_1', email: 'test@example.com' };

    await expect(
      service.ask(user, { question: 'What happened to conversions?' })
    ).rejects.toThrow(ServiceUnavailableException);

    // Quota was reserved initially, but released on failure and NOT charged
    expect(mockUsage.reserveAskInvestigation).toHaveBeenCalled();
    expect(mockUsage.releaseAskInvestigation).toHaveBeenCalledWith(
      expect.anything(),
      'org_1',
      'inv_fail_1'
    );
    expect(mockUsage.chargeAskInvestigation).not.toHaveBeenCalled();
    expect(mockConversations.updateInvestigation).toHaveBeenCalledWith(
      'inv_fail_1',
      expect.objectContaining({ status: 'failed', usageCharged: false, quotaReserved: false })
    );
  });

  it('replays cached result with 0 extra quota charges when duplicate idempotencyKey is supplied', async () => {
    const mockOrchestrator = {
      runInvestigation: vi.fn()
    } as unknown as AskOrchestratorService;

    const mockConversations = {
      getInvestigationByIdempotencyKey: vi.fn().mockResolvedValue({
        id: 'inv_existing_123',
        conversationId: 'conv_existing_123',
        status: 'completed',
        question: 'What happened?',
        usageCharged: true,
        evidence: [{ type: 'funnel', id: 'fun_1', title: 'Funnel', url: '/f' }],
        findings: [{ classification: 'observed', statement: 'Conversion fell 5%' }],
        suggestedFollowups: ['Why?']
      }),
      getConversationMessages: vi.fn().mockResolvedValue([
        { role: 'user', content: 'What happened?' },
        { role: 'assistant', content: 'OBSERVED: Conversion fell 5%.' }
      ])
    } as unknown as ConversationService;

    const mockUsage = {
      reserveAskInvestigation: vi.fn(),
      chargeAskInvestigation: vi.fn()
    };

    const service = new AskService(
      mockOrchestrator,
      mockConversations,
      { isAiEnabled: () => true } as any,
      { requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj_1', organizationId: 'org_1' }) } as any,
      {} as any,
      mockUsage as any,
      {} as any
    );

    const user: DashboardUser = { id: 'usr_1', email: 'test@example.com' };

    const response = await service.ask(user, {
      question: 'What happened?',
      idempotencyKey: 'client-key-123'
    });

    expect(response.investigationId).toBe('inv_existing_123');
    expect(response.answer).toBe('OBSERVED: Conversion fell 5%.');
    expect(response.model).toBe('cached');
    // ZERO AI generation, ZERO quota reservation, ZERO charges
    expect(mockOrchestrator.runInvestigation).not.toHaveBeenCalled();
    expect(mockUsage.reserveAskInvestigation).not.toHaveBeenCalled();
    expect(mockUsage.chargeAskInvestigation).not.toHaveBeenCalled();
  });
});

