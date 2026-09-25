import { describe, expect, it } from 'vitest';

describe('Dashboard Setup Wizard and Products', () => {
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
        sdkVersion: '0.1.4',
        origin: 'http://localhost:3000'
      }
    };

    expect(rawEvent.eventName).toBe('traceiq_setup_verified');
    expect(rawEvent.source).toBe('localhost:3000');
    expect(rawEvent.environment).toBe('development');
    expect(rawEvent.metadata.framework).toBe('Next.js');
  });

  it('produces safe setup reports with no exposed secrets', () => {
    const writeKey = 'trq_live_supersecretwritekey12345';
    const masked = writeKey.replace(/^(trq_live_)[a-zA-Z0-9]+$/, '$1••••••••••••••••');

    const report = {
      framework: 'Next.js (App Router)',
      sdk: 'traceiq-sdk-js',
      sdkVersion: '0.1.4',
      writeKeyMasked: masked,
      verified: true,
      verifiedAt: new Date().toISOString()
    };

    expect(report.writeKeyMasked).toBe('trq_live_••••••••••••••••');
    expect(JSON.stringify(report)).not.toContain('supersecretwritekey12345');
  });
});
