import type { QueryExecutor } from '../../database/database.service';

/** How often one user's "last seen" and daily-activity rows are written, at most. */
const ACTIVITY_WRITE_INTERVAL_MS = 10 * 60_000;
const MAX_TRACKED_USERS = 10_000;
const MAX_TRACKED_SESSIONS = 20_000;

export interface SignInClaims {
  sessionId: string;
  /** Primary sign-in method from the token's amr claim, e.g. password, oauth, otp. */
  method: string | null;
  /** When the session was authenticated, in ms. */
  signedInAt: number;
}

/**
 * Records platform growth numbers as a side effect of authenticating dashboard and API
 * requests: one sign-in row per Supabase session and one activity row per user per day.
 * Writes are throttled in memory so a busy session costs one small write every ten
 * minutes, and never block or fail the request they ride on.
 */
export class UserActivityRecorder {
  private readonly lastActivityWrite = new Map<string, number>();
  private readonly recordedSessions = new Set<string>();

  constructor(private readonly database: QueryExecutor) {}

  record(user: { id: string; email?: string }, signIn: SignInClaims | null, now = Date.now()): void {
    if (signIn && !this.recordedSessions.has(signIn.sessionId)) {
      remember(this.recordedSessions, signIn.sessionId, MAX_TRACKED_SESSIONS);
      this.database
        .query(
          `
            INSERT INTO dashboard_sign_ins (session_id, user_id, email, method, signed_in_at)
            VALUES ($1, $2, $3, $4, to_timestamp($5::double precision / 1000))
            ON CONFLICT (session_id) DO NOTHING
          `,
          [signIn.sessionId, user.id, user.email ?? null, signIn.method, signIn.signedInAt]
        )
        .catch(() => this.recordedSessions.delete(signIn.sessionId));
    }

    const last = this.lastActivityWrite.get(user.id);
    if (last !== undefined && now - last < ACTIVITY_WRITE_INTERVAL_MS && sameUtcDay(last, now)) return;
    if (!this.lastActivityWrite.has(user.id) && this.lastActivityWrite.size >= MAX_TRACKED_USERS) {
      const oldest = this.lastActivityWrite.keys().next().value;
      if (oldest !== undefined) this.lastActivityWrite.delete(oldest);
    }
    this.lastActivityWrite.delete(user.id);
    this.lastActivityWrite.set(user.id, now);

    this.database
      .query(
        `
          WITH seen AS (
            INSERT INTO dashboard_user_last_seen (user_id, email, last_seen_at)
            VALUES ($1, $2, now())
            ON CONFLICT (user_id) DO UPDATE
              SET last_seen_at = now(),
                  email = COALESCE(EXCLUDED.email, dashboard_user_last_seen.email)
          )
          INSERT INTO dashboard_user_activity (user_id, day)
          VALUES ($1, (now() AT TIME ZONE 'UTC')::date)
          ON CONFLICT DO NOTHING
        `,
        [user.id, user.email ?? null]
      )
      .catch(() => {
        if (this.lastActivityWrite.get(user.id) === now) this.lastActivityWrite.delete(user.id);
      });
  }

  /** Forget a deleted user so nothing is written for them again from cached state. */
  forget(userId: string): void {
    this.lastActivityWrite.delete(userId);
  }
}

/** Reads the session ID and primary sign-in method and time from a Supabase access token. */
export function decodeSignInClaims(token: string): SignInClaims | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const claims = JSON.parse(json) as { session_id?: unknown; amr?: unknown; iat?: unknown };
    if (typeof claims.session_id !== 'string' || !claims.session_id) return null;

    // The earliest amr entry is the primary sign-in; later ones are MFA steps.
    let method: string | null = null;
    let signedInAt: number | null = null;
    if (Array.isArray(claims.amr)) {
      for (const entry of claims.amr as Array<{ method?: unknown; timestamp?: unknown }>) {
        if (typeof entry?.timestamp !== 'number') continue;
        if (signedInAt === null || entry.timestamp * 1000 < signedInAt) {
          signedInAt = entry.timestamp * 1000;
          method = typeof entry.method === 'string' ? entry.method : null;
        }
      }
    }
    if (signedInAt === null) {
      if (typeof claims.iat !== 'number') return null;
      signedInAt = claims.iat * 1000;
    }
    return { sessionId: claims.session_id, method, signedInAt };
  } catch {
    return null;
  }
}

function remember(set: Set<string>, value: string, max: number): void {
  if (set.size >= max) {
    const oldest = set.values().next().value;
    if (oldest !== undefined) set.delete(oldest);
  }
  set.add(value);
}

function sameUtcDay(a: number, b: number): boolean {
  return Math.floor(a / 86_400_000) === Math.floor(b / 86_400_000);
}
