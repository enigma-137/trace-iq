import { redirect } from 'next/navigation';
import { createSupabaseServerClient, hasSupabaseServerConfig } from '@/lib/supabase/server';

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export interface DashboardSession {
  user: { id: string; email?: string | null };
  token: string | null;
}

/**
 * Guards a dashboard route: redirects to login when Supabase is unconfigured or
 * the visitor is unauthenticated, otherwise returns the user + access token.
 */
export async function requireDashboardSession(nextPath: string): Promise<DashboardSession> {
  if (!hasSupabaseServerConfig()) {
    redirect('/auth/login?missingConfig=1');
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  return { user: { id: user.id, email: user.email }, token: session?.access_token ?? null };
}

export async function dashboardGet<T>(
  path: string,
  token: string | null
): Promise<{ data: T | null; error: string | null }> {
  if (!token) {
    return { data: null, error: 'Your dashboard session expired. Sign in again.' };
  }

  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!response.ok) {
      return { data: null, error: await readErrorMessage(response) };
    }

    return { data: (await response.json()) as T, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error.message : 'Request failed.' };
  }
}

export async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { message?: string };
    return body.message ?? `Request failed with ${response.status}`;
  } catch {
    return `Request failed with ${response.status}`;
  }
}
