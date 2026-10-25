import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStepUpResponse, registerStepUpVerifier, requestStepUp, retryAfterStepUp } from '../src/lib/step-up';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const stepUpExpired = () =>
  json(403, { statusCode: 403, error: 'STEP_UP_EXPIRED', message: 'Step-up authentication expired. Please complete a second factor again.' });

let unregister: (() => void) | undefined;
afterEach(() => {
  unregister?.();
  unregister = undefined;
});

describe('isStepUpResponse', () => {
  it('recognises the API step-up codes and leaves other responses alone', async () => {
    expect(await isStepUpResponse(stepUpExpired())).toBe(true);
    expect(await isStepUpResponse(json(403, { error: 'STEP_UP_REQUIRED' }))).toBe(true);
    expect(await isStepUpResponse(json(403, { error: 'Forbidden', message: 'Owners only' }))).toBe(false);
    expect(await isStepUpResponse(json(401, { error: 'STEP_UP_EXPIRED' }))).toBe(false);
    expect(await isStepUpResponse(new Response('not json', { status: 403 }))).toBe(false);
  });

  it('does not consume the body, so callers can still read the error', async () => {
    const response = stepUpExpired();
    await isStepUpResponse(response);
    expect(((await response.json()) as { message: string }).message).toContain('Step-up');
  });
});

describe('requestStepUp', () => {
  it('resolves false when no dialog is mounted', async () => {
    expect(await requestStepUp()).toBe(false);
  });

  it('shares one prompt between concurrent requests', async () => {
    let resolve!: (verified: boolean) => void;
    const verifier = vi.fn(() => new Promise<boolean>((r) => (resolve = r)));
    unregister = registerStepUpVerifier(verifier);

    const first = requestStepUp();
    const second = requestStepUp();
    resolve(true);

    expect(await Promise.all([first, second])).toEqual([true, true]);
    expect(verifier).toHaveBeenCalledTimes(1);
  });
});

describe('retryAfterStepUp', () => {
  it('returns non step-up responses untouched without prompting', async () => {
    const verifier = vi.fn(async () => true);
    unregister = registerStepUpVerifier(verifier);
    const ok = json(201, { id: 'tok_1' });
    const resend = vi.fn();

    expect(await retryAfterStepUp(ok, resend)).toBe(ok);
    expect(verifier).not.toHaveBeenCalled();
    expect(resend).not.toHaveBeenCalled();
  });

  it('retries once after the user verifies', async () => {
    unregister = registerStepUpVerifier(async () => true);
    const created = json(201, { id: 'tok_1' });
    const resend = vi.fn(async () => created);

    expect(await retryAfterStepUp(stepUpExpired(), resend)).toBe(created);
    expect(resend).toHaveBeenCalledTimes(1);
  });

  it('keeps the original error when the user cancels', async () => {
    unregister = registerStepUpVerifier(async () => false);
    const original = stepUpExpired();
    const resend = vi.fn();

    expect(await retryAfterStepUp(original, resend)).toBe(original);
    expect(resend).not.toHaveBeenCalled();
  });
});
