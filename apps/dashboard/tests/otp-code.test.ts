import { describe, expect, it } from 'vitest';
import { isCompleteOtpCode, normalizeOtpCode } from '../src/lib/otp-code';

describe('authenticator code handling', () => {
  it('accepts digits only and limits pasted values to six digits', () => {
    expect(normalizeOtpCode('12a 34-5678')).toBe('123456');
  });

  it('recognizes only an exact six-digit code as complete', () => {
    expect(isCompleteOtpCode('12345')).toBe(false);
    expect(isCompleteOtpCode('123456')).toBe(true);
    expect(isCompleteOtpCode('12345a')).toBe(false);
  });
});
