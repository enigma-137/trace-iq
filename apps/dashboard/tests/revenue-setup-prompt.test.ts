import { describe, expect, it } from 'vitest';
import { REVENUE_BACKENDS, buildRevenueExample, buildRevenueSetupPrompt } from '../src/lib/revenue-setup-prompt';

describe('revenue setup prompt', () => {
  it('points a Python backend at the Python SDK, not Node', () => {
    const prompt = buildRevenueSetupPrompt({ projectId: 'proj_1', backend: 'python', currency: 'NGN' });
    expect(prompt).toContain('pip install traceiq-py');
    expect(prompt).toContain('from traceiq import Client');
    expect(prompt).toContain('user_id=');
    expect(prompt).not.toContain('traceiq-node');
  });

  it('gives an unsupported language the HTTP contract', () => {
    const prompt = buildRevenueSetupPrompt({ backend: 'http' });
    expect(prompt).toContain('POST https://api.traceiq.run/v1/events');
    expect(prompt).toContain('x-traceiq-write-key');
    expect(prompt).toContain('"eventName": "payment_succeeded"');
  });

  it('always sets the endpoint, since the SDKs default to localhost', () => {
    for (const { id } of REVENUE_BACKENDS) {
      expect(buildRevenueSetupPrompt({ backend: id })).toContain('TRACEIQ_ENDPOINT (https://api.traceiq.run)');
    }
  });

  it('tells the assistant to match the frontend identify id', () => {
    expect(buildRevenueSetupPrompt({})).toContain("Don't assume the backend's user id matches");
  });

  it('uses the chosen event and amount property in examples', () => {
    const example = buildRevenueExample('php', { successEvent: 'order_paid', amountProperty: 'total' });
    expect(example.language).toBe('PHP');
    expect(example.code).toContain("event: 'order_paid'");
    expect(example.code).toContain("'total' => 5000");
  });
});
