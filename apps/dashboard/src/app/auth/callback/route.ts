import { NextResponse, type NextRequest } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { safeRedirectPath } from '@/lib/utils';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeRedirectPath(searchParams.get('next'), '/dashboard');

  if (code) {
    const supabase = createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsStepUp = !aalError && aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';
      if (needsStepUp) {
        return NextResponse.redirect(`${origin}/auth/login?next=${encodeURIComponent(next)}`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  } else if (searchParams.has('access_token')) {
    // OAuth/confirmation flows using the implicit grant may return the token in
    // the URL fragment, which the server never sees. Preserve the return path so
    // the client-side session pick-up (PendingInviteRestorer / login page) re-
    // establishes invite context instead of dropping it on the dashboard.
    return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/auth/auth-code-error`);
}