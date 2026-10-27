import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { ACTIVE_PROJECT_COOKIE } from '@/lib/active-project';

const protectedPrefixes = ['/dashboard'];
const authPrefixes = ['/auth'];

function selectedProjectFromUrl(request: NextRequest): string | null {
  if (!request.nextUrl.pathname.startsWith('/dashboard')) return null;
  const projectId = request.nextUrl.searchParams.get('projectId')?.trim();
  return projectId && projectId.length <= 200 ? projectId : null;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Remember the project in the URL so every page (and API call) follows a
  // project switch. Set on the request too, so this render already sees it.
  const selectedProjectId = selectedProjectFromUrl(request);
  if (selectedProjectId) {
    request.cookies.set(ACTIVE_PROJECT_COOKIE, selectedProjectId);
  }
  const rememberProject = (res: NextResponse) => {
    if (selectedProjectId) {
      res.cookies.set(ACTIVE_PROJECT_COOKIE, selectedProjectId, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    }
    return res;
  };

  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    if (authPrefixes.some((prefix) => pathname.startsWith(prefix))) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/dashboard';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
    return rememberProject(NextResponse.next({ request }));
  }

  if (process.env.NEXT_PUBLIC_WAITLIST_ONLY === 'true') {
    // Avoid redirecting during Next.js build-time pre-rendering (which would cause build errors)
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/';
      redirectUrl.search = '';
      return NextResponse.redirect(redirectUrl);
    }
  }

  let response = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const isProtectedRoute = protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
  const isAuthRoute = authPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (!supabaseUrl || !supabaseAnonKey) {
    if (isProtectedRoute) {
      const redirectUrl = request.nextUrl.clone();
      redirectUrl.pathname = '/auth/login';
      redirectUrl.searchParams.set('missingConfig', '1');
      return NextResponse.redirect(redirectUrl);
    }

    return response;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({
          request,
        });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute && !user) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = '/auth/login';
    redirectUrl.search = '';
    redirectUrl.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(redirectUrl);
  }

  if (isAuthRoute && user) {
    // Signed-in people still pass through these: connecting GitHub/GitLab from Settings
    // returns to the callback, and a failed connection lands on the error page.
    const staysOnAuthRoute = ['/auth/reset-password', '/auth/callback', '/auth/auth-code-error'].includes(pathname);
    if (!staysOnAuthRoute) {
      const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const needsStepUp = !aalError && aal?.currentLevel === 'aal1' && aal?.nextLevel === 'aal2';

      if (!needsStepUp) {
        const redirectUrl = request.nextUrl.clone();
        redirectUrl.pathname = '/dashboard';
        redirectUrl.search = '';
        return NextResponse.redirect(redirectUrl);
      }
    }
  }

  return rememberProject(response);
}

export const config = {
  matcher: ['/dashboard/:path*', '/auth/:path*', '/sdk-demo'],
};
