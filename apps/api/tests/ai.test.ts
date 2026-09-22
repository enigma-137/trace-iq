import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiSanitizerService } from '../src/modules/ai/context/ai-sanitizer.service';
import { AiModelPolicyService } from '../src/modules/ai/models/ai-model-policy.service';
import { AiContextService } from '../src/modules/ai/context/ai-context.service';
import { AiRunsService } from '../src/modules/ai/usage/ai-runs.service';
import { CencoriProvider } from '../src/modules/ai/providers/cencori.provider';
import { AiService } from '../src/modules/ai/ai.service';
import { FunnelsService } from '../src/modules/funnels/funnels.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { DashboardUser } from '../src/modules/auth/auth.service';
import { mockDatabase, empty } from './helpers/mock-db';
import { ServiceUnavailableException } from '@nestjs/common';

describe('AiSanitizerService', () => {
  let sanitizer: AiSanitizerService;

  beforeEach(() => {
    sanitizer = new AiSanitizerService();
  });

  it('redacts email addresses, JWTs, IPs, and Bearer tokens in text', () => {
    const input =
      'User alice@example.com logged in from 192.168.1.5 with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis';
    const sanitized = sanitizer.sanitizeText(input);

    expect(sanitized).not.toContain('alice@example.com');
    expect(sanitized).not.toContain('192.168.1.5');
    expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiJ9');
    expect(sanitized).toContain('[REDACTED_EMAIL]');
    expect(sanitized).toContain('[REDACTED_IP]');
    expect(sanitized).toContain('Bearer [REDACTED_TOKEN]');
  });

  it('redacts credit card patterns', () => {
    const input = 'Card 4532-1234-5678-9010 was used';
    const sanitized = sanitizer.sanitizeText(input);
    expect(sanitized).toContain('[REDACTED_PAYMENT]');
    expect(sanitized).not.toContain('4532-1234-5678-9010');
  });

  it('preserves clean metric names and numbers', () => {
    const input = 'Checkout Completed: 450 users (32.5% conversion)';
    const sanitized = sanitizer.sanitizeText(input);
    expect(sanitized).toBe('Checkout Completed: 450 users (32.5% conversion)');
  });

  it('recursively redacts sensitive object keys', () => {
    const data = {
      eventName: 'checkout_step',
      password: 'supersecretpassword',
      apiKey: 'csk_12345678',
      nested: {
        token: 'secret_token_val',
        stepCount: 42,
        email: 'bob@example.com'
      }
    };

    const sanitized = sanitizer.sanitizeData(data);
    expect(sanitized.eventName).toBe('checkout_step');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.apiKey).toBe('[REDACTED]');
    expect(sanitized.nested.token).toBe('[REDACTED]');
    expect(sanitized.nested.stepCount).toBe(42);
    expect(sanitized.nested.email).toBe('[REDACTED_EMAIL]');
  });
});

describe('AiModelPolicyService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('detects when AI is enabled or disabled', () => {
    const policy = new AiModelPolicyService();

    delete process.env.CENCORI_API_KEY;
    expect(policy.isAiEnabled()).toBe(false);

    process.env.CENCORI_API_KEY = 'csk_test_123';
    expect(policy.isAiEnabled()).toBe(true);

    process.env.TRACEIQ_AI_ENABLED = 'false';
    expect(policy.isAiEnabled()).toBe(false);
  });

  it('resolves fast and reasoning models with overrides', () => {
    const policy = new AiModelPolicyService();
    expect(policy.getFastModel()).toBe('gpt-4o-mini');
    expect(policy.getReasoningModel()).toBe('gpt-4o');

    process.env.TRACEIQ_AI_FAST_MODEL = 'custom-fast-model';
    process.env.TRACEIQ_AI_REASONING_MODEL = 'custom-reasoning-model';

    expect(policy.getFastModel()).toBe('custom-fast-model');
    expect(policy.getReasoningModel()).toBe('custom-reasoning-model');
    expect(policy.getModelForCapability('funnel_analysis')).toBe('custom-fast-model');
    expect(policy.getModelForCapability('story_analysis')).toBe('custom-fast-model');
    expect(policy.getModelForCapability('assistant')).toBe('custom-reasoning-model');
  });

  it('parses configured timeout within bounds', () => {
    const policy = new AiModelPolicyService();
    expect(policy.getTimeoutMs()).toBe(15_000);

    process.env.TRACEIQ_AI_TIMEOUT_MS = '25000';
    expect(policy.getTimeoutMs()).toBe(25_000);

    process.env.TRACEIQ_AI_TIMEOUT_MS = 'invalid';
    expect(policy.getTimeoutMs()).toBe(15_000);
  });
});

describe('AiContextService', () => {
  let contextService: AiContextService;
  let sanitizer: AiSanitizerService;

  beforeEach(() => {
    sanitizer = new AiSanitizerService();
    contextService = new AiContextService(sanitizer);
  });

  it('builds structured and sanitized funnel prompt data', () => {
    const results = {
      funnel: { id: 'f1', name: 'Onboarding user test@example.com' },
      days: 30,
      steps: [
        { stepIndex: 0, eventName: 'visit', count: 100, conversionFromStart: 1.0, conversionFromPrevious: 1.0, droppedFromPrevious: 0 },
        { stepIndex: 1, eventName: 'signup', label: 'Signup step for 192.168.1.1', count: 40, conversionFromStart: 0.4, conversionFromPrevious: 0.4, droppedFromPrevious: 60 }
      ]
    };

    const data = contextService.buildFunnelData(results as any);
    expect(data.funnelName).toContain('[REDACTED_EMAIL]');
    expect(data.steps[1].label).toContain('[REDACTED_IP]');
    expect(data.worstDrop?.dropCount).toBe(60);
    expect(data.worstDrop?.dropRatePct).toBe(60);
  });

  it('caches and retrieves results for identical deterministic inputs', () => {
    const key = contextService.computeCacheKey('proj1', 'funnel_analysis', 'v1', 'gpt-4o-mini', { foo: 'bar' });
    expect(contextService.getCached(key)).toBeNull();

    contextService.setCached(key, 'Cached funnel summary', 'gpt-4o-mini', 'v1');
    const cached = contextService.getCached(key);

    expect(cached).not.toBeNull();
    expect(cached?.content).toBe('Cached funnel summary');
  });
});

describe('AiRunsService', () => {
  it('records an audit run into the database', async () => {
    const db = mockDatabase((text) => {
      if (/INSERT INTO ai_runs/.test(text)) {
        return empty();
      }
      return empty();
    });

    const sanitizer = new AiSanitizerService();
    const service = new AiRunsService(db as any, sanitizer);

    await service.recordRun({
      organizationId: 'org1',
      projectId: 'proj1',
      actorUserId: 'user1',
      capability: 'funnel_analysis',
      promptVersion: 'funnel_analysis_v1',
      requestedModel: 'gpt-4o-mini',
      routedModel: 'gemini-2.5-flash-lite',
      status: 'success',
      inputTokens: 150,
      outputTokens: 40,
      latencyMs: 320,
      providerRequestId: 'req_123'
    });

    const calls = db.queryCalls(/INSERT INTO ai_runs/);
    expect(calls.length).toBe(1);
    expect(calls[0].values[1]).toBe('org1');
    expect(calls[0].values[2]).toBe('proj1');
    expect(calls[0].values[3]).toBe('user1');
    expect(calls[0].values[4]).toBe('funnel_analysis');
    expect(calls[0].values[6]).toBe('gpt-4o-mini');
    expect(calls[0].values[7]).toBe('gemini-2.5-flash-lite');
    expect(calls[0].values[8]).toBe('success');
  });

  it('sanitizes and bounds error messages in audit records', async () => {
    const db = mockDatabase((text) => {
      if (/INSERT INTO ai_runs/.test(text)) return empty();
      return empty();
    });

    const sanitizer = new AiSanitizerService();
    const service = new AiRunsService(db as any, sanitizer);

    await service.recordRun({
      organizationId: 'org1',
      projectId: 'proj1',
      actorUserId: 'user1',
      capability: 'funnel_analysis',
      promptVersion: 'funnel_analysis_v1',
      requestedModel: 'gpt-4o-mini',
      routedModel: null,
      status: 'failed',
      latencyMs: 100,
      errorMessage: 'Failed to contact backend for token eyJhbGciOiJIUzI1NiJ9.test and user admin@secret.com'
    });

    const calls = db.queryCalls(/INSERT INTO ai_runs/);
    expect(calls.length).toBe(1);
    const errorParam = calls[0].values[13];
    expect(errorParam).toContain('[REDACTED_JWT]');
    expect(errorParam).toContain('[REDACTED_EMAIL]');
    expect(errorParam).not.toContain('admin@secret.com');
  });
});

describe('CencoriProvider', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, CENCORI_API_KEY: 'csk_test_key' };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('throws ServiceUnavailableException when CENCORI_API_KEY is missing', async () => {
    delete process.env.CENCORI_API_KEY;
    const provider = new CencoriProvider();
    await expect(
      provider.complete({
        model: 'gpt-4o-mini',
        systemPrompt: 'System',
        userPrompt: 'User'
      })
    ).rejects.toThrow(ServiceUnavailableException);
  });
});

describe('AiService', () => {
  let sanitizer: AiSanitizerService;
  let modelPolicy: AiModelPolicyService;
  let contextService: AiContextService;

  beforeEach(() => {
    process.env.CENCORI_API_KEY = 'csk_test_123';
    sanitizer = new AiSanitizerService();
    modelPolicy = new AiModelPolicyService();
    contextService = new AiContextService(sanitizer);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.CENCORI_API_KEY;
  });

  it('returns insufficient data message without calling provider', async () => {
    const funnels = {
      getResults: vi.fn().mockResolvedValue({
        funnel: { id: 'f1', name: 'Signup Flow' },
        days: 7,
        steps: [{ stepIndex: 0, count: 2, conversionFromStart: 1 }]
      })
    } as unknown as FunnelsService;

    const provider = {
      isConfigured: vi.fn().mockReturnValue(true),
      complete: vi.fn()
    } as unknown as CencoriProvider;

    const projects = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj1', organizationId: 'org1' })
    } as unknown as ProjectsService;

    const aiRuns = { recordRun: vi.fn() } as unknown as AiRunsService;

    const service = new AiService(
      funnels,
      provider,
      modelPolicy,
      sanitizer,
      contextService,
      aiRuns,
      projects
    );

    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };
    const result = await service.summarizeFunnelDropOff(user, 'f1', '7', 'proj1');

    expect(result.summary).toContain('Not enough traffic through this funnel yet');
    expect(result.model).toBe('none');
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('calls Cencori provider and records run on success', async () => {
    const funnels = {
      getResults: vi.fn().mockResolvedValue({
        funnel: { id: 'f1', name: 'Checkout Funnel' },
        days: 14,
        steps: [
          { stepIndex: 0, eventName: 'cart', count: 1000, conversionFromStart: 1.0, conversionFromPrevious: 1.0, droppedFromPrevious: 0 },
          { stepIndex: 1, eventName: 'pay', count: 400, conversionFromStart: 0.4, conversionFromPrevious: 0.4, droppedFromPrevious: 600 }
        ]
      })
    } as unknown as FunnelsService;

    const provider = {
      isConfigured: vi.fn().mockReturnValue(true),
      complete: vi.fn().mockResolvedValue({
        content: 'Drop-off of 60% observed at payment step. Check gateway error rates.',
        requestedModel: 'gpt-4o-mini',
        routedModel: 'gpt-4o-mini',
        inputTokens: 120,
        outputTokens: 25,
        providerRequestId: 'csk_req_1',
        latencyMs: 250
      })
    } as unknown as CencoriProvider;

    const projects = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj1', organizationId: 'org1' })
    } as unknown as ProjectsService;

    const aiRuns = { recordRun: vi.fn() } as unknown as AiRunsService;

    const service = new AiService(
      funnels,
      provider,
      modelPolicy,
      sanitizer,
      contextService,
      aiRuns,
      projects
    );

    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };
    const result = await service.summarizeFunnelDropOff(user, 'f1', '14', 'proj1');

    expect(result.summary).toContain('Drop-off of 60% observed');
    expect(result.model).toBe('gpt-4o-mini');
    expect(aiRuns.recordRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiRuns.recordRun).mock.calls[0][0].status).toBe('success');
  });

  it('fails gracefully when provider is down', async () => {
    const funnels = {
      getResults: vi.fn().mockResolvedValue({
        funnel: { id: 'f1', name: 'Checkout Funnel' },
        days: 14,
        steps: [
          { stepIndex: 0, eventName: 'cart', count: 1000, conversionFromStart: 1.0, conversionFromPrevious: 1.0, droppedFromPrevious: 0 },
          { stepIndex: 1, eventName: 'pay', count: 400, conversionFromStart: 0.4, conversionFromPrevious: 0.4, droppedFromPrevious: 600 }
        ]
      })
    } as unknown as FunnelsService;

    const provider = {
      isConfigured: vi.fn().mockReturnValue(true),
      complete: vi.fn().mockRejectedValue(new ServiceUnavailableException('AI analysis is temporarily unavailable.'))
    } as unknown as CencoriProvider;

    const projects = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj1', organizationId: 'org1' })
    } as unknown as ProjectsService;

    const aiRuns = { recordRun: vi.fn() } as unknown as AiRunsService;

    const service = new AiService(
      funnels,
      provider,
      modelPolicy,
      sanitizer,
      contextService,
      aiRuns,
      projects
    );

    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };
    await expect(service.summarizeFunnelDropOff(user, 'f1', '14', 'proj1')).rejects.toThrow(
      ServiceUnavailableException
    );

    expect(aiRuns.recordRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiRuns.recordRun).mock.calls[0][0].status).toBe('failed');
  });

  it('generates story narrative with graceful fallback to null on error', async () => {
    const funnels = {} as FunnelsService;
    const provider = {
      isConfigured: vi.fn().mockReturnValue(true),
      complete: vi.fn().mockRejectedValue(new Error('Gateway 502'))
    } as unknown as CencoriProvider;

    const aiRuns = { recordRun: vi.fn() } as unknown as AiRunsService;
    const service = new AiService(
      funnels,
      provider,
      modelPolicy,
      sanitizer,
      contextService,
      aiRuns
    );

    const narrative = await service.generateStoryNarrative(
      { id: 'proj1', name: 'Acme', organizationId: 'org1' },
      {
        eventsToday: 10,
        eventsYesterday: 5,
        deltaPct: 100,
        uniquesToday: 3,
        topEvent: null,
        topCountry: null,
        topDevice: null,
        activeNow: 1,
        lastEventAt: null
      }
    );

    expect(narrative).toBeNull();
    expect(aiRuns.recordRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiRuns.recordRun).mock.calls[0][0].status).toBe('fallback');
  });

  it('handles malformed/empty AI output with controlled fallback without crashing', async () => {
    const funnels = {
      getResults: vi.fn().mockResolvedValue({
        funnel: { id: 'f1', name: 'Checkout Funnel' },
        days: 14,
        steps: [
          { stepIndex: 0, eventName: 'cart', count: 1000, conversionFromStart: 1.0, conversionFromPrevious: 1.0, droppedFromPrevious: 0 },
          { stepIndex: 1, eventName: 'pay', count: 400, conversionFromStart: 0.4, conversionFromPrevious: 0.4, droppedFromPrevious: 600 }
        ]
      })
    } as unknown as FunnelsService;

    const provider = {
      isConfigured: vi.fn().mockReturnValue(true),
      complete: vi.fn().mockResolvedValue({
        content: '   ', // whitespace only
        model: 'gpt-4o-mini',
        latencyMs: 100
      })
    } as unknown as CencoriProvider;

    const projects = {
      requireActiveProject: vi.fn().mockResolvedValue({ id: 'proj1', organizationId: 'org1' })
    } as unknown as ProjectsService;

    const aiRuns = { recordRun: vi.fn() } as unknown as AiRunsService;

    const service = new AiService(
      funnels,
      provider,
      modelPolicy,
      sanitizer,
      contextService,
      aiRuns,
      projects
    );

    const user: DashboardUser = { id: 'user1', email: 'test@example.com' };
    await expect(service.summarizeFunnelDropOff(user, 'f1', '14', 'proj1')).rejects.toThrow();

    expect(aiRuns.recordRun).toHaveBeenCalledTimes(1);
    expect(vi.mocked(aiRuns.recordRun).mock.calls[0][0].status).toBe('failed');
  });
});

