export const OTP_CODE_LENGTH = 6;

/** Keeps authenticator input numeric and bounded, including pasted values. */
export function normalizeOtpCode(value: string): string {
  return value.replace(/\D/g, '').slice(0, OTP_CODE_LENGTH);
}

export function isCompleteOtpCode(value: string): boolean {
  return value.length === OTP_CODE_LENGTH && /^\d{6}$/.test(value);
}
