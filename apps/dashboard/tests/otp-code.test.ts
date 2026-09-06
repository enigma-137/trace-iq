import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createOtpSubmissionGuard, isCompleteOtpCode, normalizeOtpCode } from '../src/lib/otp-code';

describe('authenticator code handling', () => {
  it('accepts digits only and limits pasted values to six digits', () => {
    expect(normalizeOtpCode('12a 34-5678')).toBe('123456');
  });

  it('recognizes only an exact six-digit code as complete', () => {
    expect(isCompleteOtpCode('12345')).toBe(false);
    expect(isCompleteOtpCode('123456')).toBe(true);
    expect(isCompleteOtpCode('12345a')).toBe(false);
  });

  it('allows only one verification until the current attempt finishes', () => {
    const guard = createOtpSubmissionGuard();

    expect(guard.tryStart()).toBe(true);
    expect(guard.tryStart()).toBe(false);
    guard.finish();
    expect(guard.tryStart()).toBe(true);
  });

  it.each([
    ['login challenge', 'app/auth/login/AuthForm.tsx', 1],
    ['2FA settings', 'app/dashboard/settings/2fa/TwoFactorSetupPanel.tsx', 2]
  ] as const)('%s keeps every code input mobile- and password-manager-friendly', (_name, relativePath, expectedInputs) => {
    const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), 'utf8');

    expect(source.match(/inputMode="numeric"/g)).toHaveLength(expectedInputs);
    expect(source.match(/autoComplete="one-time-code"/g)).toHaveLength(expectedInputs);
    expect(source.match(/maxLength=\{6\}/g)).toHaveLength(expectedInputs);
    expect(source.match(/pattern="\[0-9\]\*"/g)).toHaveLength(expectedInputs);
  });
});
