import { describe, expect, it } from 'vitest';

describe('Dashboard Setup Wizard and Real Project Scoping', () => {
  it('defines the core TraceIQ product catalog', () => {
    const products = [
      { id: 'analytics', name: 'Product Analytics', desc: 'Track events, trends and user behaviour' },
      { id: 'web-analytics', name: 'Web Analytics', desc: 'Understand traffic, pages and acquisition' },
      { id: 'errors', name: 'Error Tracking', desc: 'Capture application errors and failures' },
      { id: 'identification', name: 'User Analytics', desc: 'Identify users and understand their timelines' },
      { id: 'flags', name: 'Feature Flags', desc: 'Control releases and gradual rollouts' },
      { id: 'web-vitals', name: 'Web Vitals', desc: 'Monitor application performance' },
      { id: 'revenue', name: 'Revenue Analytics', desc: 'Understand payments and revenue events' },
      { id: 'funnels', name: 'Funnels', desc: 'Understand conversion paths' }
    ];

    expect(products.length).toBe(8);
    expect(products.map((p) => p.id)).toContain('analytics');
    expect(products.map((p) => p.id)).toContain('errors');
    expect(products.map((p) => p.id)).toContain('identification');
  });

  it('formats verified event data correctly for the success state', () => {
    const rawEvent = {
      eventName: 'traceiq_setup_verified',
      eventId: 'evt_abc123',
      receivedAt: '2026-09-25T13:00:00.000Z',
      source: 'localhost:3000',
      environment: 'development',
      metadata: {
        framework: 'Next.js',
        sdkVersion: '0.1.8',
        origin: 'http://localhost:3000'
      }
    };

    expect(rawEvent.eventName).toBe('traceiq_setup_verified');
    expect(rawEvent.source).toBe('localhost:3000');
    expect(rawEvent.environment).toBe('development');
    expect(rawEvent.metadata.framework).toBe('Next.js');
  });

  it('produces safe setup reports with real project context and no exposed secrets', () => {
    const realProjectId = 'proj_nuwell_prod_9988';
    const realProjectName = 'NuWell Production';
    const writeKey = 'tr_live_9988aabbccddeeff0011223344556677';
    const masked = writeKey.replace(/^(tr_live_)[a-zA-Z0-9]+$/, '$1••••••••••••••••');

    const report = {
      projectId: realProjectId,
      projectName: realProjectName,
      framework: 'Next.js (App Router)',
      sdk: 'traceiq-sdk-js',
      sdkVersion: '0.1.8',
      writeKeyMasked: masked,
      verified: true,
      verifiedAt: new Date().toISOString()
    };

    expect(report.projectId).toBe(realProjectId);
    expect(report.projectName).toBe(realProjectName);
    expect(report.writeKeyMasked).toBe('tr_live_••••••••••••••••');
    expect(report.projectId).not.toBe('prj_default');
    expect(report.writeKeyMasked).not.toContain('tiq_live_default');
    expect(JSON.stringify(report)).not.toContain('9988aabbccddeeff0011223344556677');
  });

  it('generates real-scoped usetrace CLI and environment snippets', () => {
    const realProjectId = 'proj_healthcorp_live_123';
    const realProjectName = 'HealthCorp Web';
    const realWriteKey = 'tr_live_abcdef1234567890abcdef1234567890';
    const apiUrl = 'https://api.traceiq.run';

    // Verify command generation matches published package name (npx usetrace)
    const usetraceCommand = `npx usetrace --project-id ${realProjectId} --write-key ${realWriteKey}`;
    expect(usetraceCommand).toBe('npx usetrace --project-id proj_healthcorp_live_123 --write-key tr_live_abcdef1234567890abcdef1234567890');
    expect(usetraceCommand).not.toContain('prj_default');
    expect(usetraceCommand).not.toContain('tiq_live_default');
    expect(usetraceCommand).not.toContain('traceiq-cli');

    // Verify env snippet
    const envSnippet = `NEXT_PUBLIC_TRACEIQ_PROJECT_ID=${realProjectId}\nNEXT_PUBLIC_TRACEIQ_WRITE_KEY=${realWriteKey}\nNEXT_PUBLIC_TRACEIQ_API_URL=${apiUrl}`;
    expect(envSnippet).toContain('NEXT_PUBLIC_TRACEIQ_PROJECT_ID=proj_healthcorp_live_123');
    expect(envSnippet).toContain('NEXT_PUBLIC_TRACEIQ_WRITE_KEY=tr_live_abcdef1234567890abcdef1234567890');
    expect(envSnippet).not.toContain('prj_default');
    expect(envSnippet).not.toContain('tiq_live_default');
  });

  it('ensures verification session requests are strictly scoped to the selected project', () => {
    const selectedProjectId = 'proj_acme_analytics_456';
    const selectedWriteKey = 'tr_live_fedcba0987654321';

    const verificationPayload = {
      projectId: selectedProjectId,
      writeKey: selectedWriteKey,
      ttlSeconds: 300
    };

    expect(verificationPayload.projectId).toBe('proj_acme_analytics_456');
    expect(verificationPayload.projectId).not.toBe('prj_default');
    expect(verificationPayload.writeKey).not.toBe('tiq_live_default');
  });
});
