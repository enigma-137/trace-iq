import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';
import { SIGNED_IN_COOKIE } from '@/lib/signed-in';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard');

  // Sends the person to the error page with whatever Supabase told us, plus where they
  // were headed. An error in the URL fragment is carried along by the browser itself.
  const failed = (details: { error?: string | null; code?: string | null; description?: string | null } = {}) => {
    const params = new URLSearchParams({ next });
    if (details.error) params.set('error', details.error);
    if (details.code) params.set('error_code', details.code);
    if (details.description) params.set('error_description', details.description);
    return NextResponse.redirect(`${origin}/auth/auth-code-error?${params.toString()}`);
  };

  if (searchParams.has('error') || searchParams.has('error_code')) {
    return failed({
      error: searchParams.get('error'),
      code: searchParams.get('error_code'),
      description: searchParams.get('error_description')
    });
  }

  if (code) {
    try {
      const supabase = createSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        return failed({ code: error.code, description: error.message });
      }
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (aalError) {
        return failed({ code: aalError.code, description: aalError.message });
      }
      const needsStepUp = aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
      if (needsStepUp) {
        // `mfa=1` tells the login page this sign-in just happened, so it asks for the code
        // instead of discarding the unverified session.
        return NextResponse.redirect(`${origin}/auth/login?next=${encodeURIComponent(next)}&mfa=1`);
      }
      const response = NextResponse.redirect(`${origin}${next}`);
      // Sign-in with GitHub/GitLab finished: leave a short-lived marker so the next page can
      // say so. A cookie, not a query param, because the overview redirects and drops params.
      const provider = searchParams.get('provider');
      if (provider === 'github' || provider === 'gitlab') {
        response.cookies.set(SIGNED_IN_COOKIE, provider, { path: '/', maxAge: 60, sameSite: 'lax' });
      }
      return response;
    } catch {
      return failed();
    }
  } else if (searchParams.has('access_token')) {
    // OAuth/confirmation flows using the implicit grant may return the token in
    // the URL fragment, which the server never sees. Preserve the return path so
    // the client-side session pick-up (PendingInviteRestorer / login page) re-
    // establishes invite context instead of dropping it on the dashboard.
    return NextResponse.redirect(`${origin}${next}`);
  }

  return failed();
}
