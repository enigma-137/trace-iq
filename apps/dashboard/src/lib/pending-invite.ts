/**
 * Survives auth hops. Supabase's confirmation / OAuth redirects can land the
 * user on a different URL than the one they started from, which would otherwise
 * drop the invite token. The token is the only context needed — /invite/:token
 * resolves the organization, role and invitee email server-side. We remember it
 * on the /invite page, re-drill it into every auth redirect we control, and the
 * restorer below pulls the user back to /invite/:token once a session exists.
 */
const KEY = 'traceiq-pending-invite';

export function rememberPendingInvite(token: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const value = token?.trim();
  if (!value) return;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // Private-mode / quota errors — the query-param fallback still works.
  }
}

export function peekPendingInvite(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}