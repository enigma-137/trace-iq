import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * The OAuth `state` parameter for third-party integrations: a short-lived,
 * HMAC-signed claim of who started the connection and for which organization.
 * It travels through the provider and comes back to our callback unchanged, so
 * the callback can trust it without a dashboard session.
 *
 * Format: base64url(JSON claims) + "." + base64url(HMAC-SHA256).
 */
export interface IntegrationStateClaims {
  /** Which integration made it, so a Linear state cannot finish a GitHub install. */
  purpose: string;
  organizationId: string;
  userId: string;
  /** Project the person started from, used only to send them back to the right place. */
  projectId?: string;
  /** Which dashboard page to return to (an allowlisted name, never a URL). */
  returnTo?: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export class InvalidStateError extends Error {
  constructor(readonly reason: 'malformed' | 'signature' | 'expired' | 'purpose') {
    super(`Integration state is invalid (${reason}).`);
  }
}

export const DEFAULT_STATE_TTL_SECONDS = 10 * 60;

export function signIntegrationState(
  secret: string,
  claims: { purpose: string; organizationId: string; userId: string; projectId?: string; returnTo?: string },
  ttlSeconds = DEFAULT_STATE_TTL_SECONDS,
  now = Date.now()
): string {
  if (!secret) throw new Error('A signing secret is required.');
  const issuedAt = Math.floor(now / 1000);
  const payload: IntegrationStateClaims = {
    ...claims,
    nonce: randomBytes(16).toString('base64url'),
    issuedAt,
    expiresAt: issuedAt + ttlSeconds
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${sign(secret, encoded)}`;
}

export function verifyIntegrationState(secret: string, state: string, purpose: string, now = Date.now()): IntegrationStateClaims {
  if (!secret) throw new Error('A signing secret is required.');
  const parts = typeof state === 'string' ? state.split('.') : [];
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new InvalidStateError('malformed');
  const [encoded, supplied] = parts;

  const expected = Buffer.from(sign(secret, encoded), 'base64url');
  const received = Buffer.from(supplied, 'base64url');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new InvalidStateError('signature');
  }

  let claims: IntegrationStateClaims;
  try {
    claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as IntegrationStateClaims;
  } catch {
    throw new InvalidStateError('malformed');
  }
  if (
    !claims ||
    typeof claims.organizationId !== 'string' || !claims.organizationId ||
    typeof claims.userId !== 'string' || !claims.userId ||
    !Number.isInteger(claims.issuedAt) || !Number.isInteger(claims.expiresAt)
  ) {
    throw new InvalidStateError('malformed');
  }
  if (claims.purpose !== purpose) throw new InvalidStateError('purpose');
  const nowSeconds = Math.floor(now / 1000);
  if (claims.issuedAt > nowSeconds + 30 || claims.expiresAt <= nowSeconds) throw new InvalidStateError('expired');
  return claims;
}

/** Derives a per-purpose key so the same secret never signs two kinds of value. */
export function deriveStateKey(rootSecret: string, purpose: string): string {
  return createHmac('sha256', rootSecret).update(`traceiq:integration-state:${purpose}`).digest('base64url');
}

function sign(secret: string, value: string) {
  return createHmac('sha256', secret).update(value).digest('base64url');
}
