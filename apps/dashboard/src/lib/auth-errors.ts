// Turns the error Supabase Auth reports on a failed sign-in, confirmation or
// account-linking redirect into copy a person can act on.

export const SUPPORT_EMAIL = 'traceiq.run@gmail.com';

export interface AuthErrorParams {
  error: string | null;
  code: string | null;
  description: string | null;
}

export interface AuthErrorCopy {
  title: string;
  message: string;
  /** The provider's own wording, shown as a detail when we have no better explanation. */
  details?: string;
}

/**
 * Supabase sends the error in the query string (PKCE) or the URL fragment
 * (implicit flow, which the server never sees), so read both; the fragment wins.
 */
export function readAuthErrorParams(search: string, hash: string): AuthErrorParams {
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const pick = (key: string) => fragment.get(key) || query.get(key) || null;
  return { error: pick('error'), code: pick('error_code'), description: pick('error_description') };
}

/** `linking` is true when the person was connecting GitHub or GitLab from Settings, not signing in. */
export function describeAuthError(params: AuthErrorParams, linking = false): AuthErrorCopy {
  const code = params.code?.toLowerCase() ?? '';
  const description = params.description?.trim() ?? '';
  const text = description.toLowerCase();

  if (text.includes('multiple accounts with the same email')) {
    return {
      title: 'This email is linked to more than one account',
      message:
        'More than one TraceIQ account uses this email address, so we can’t tell which one to sign you in to with GitHub or GitLab. Sign in the way you first signed up (email and password, GitHub or GitLab). Once you’re in, connect your other sign-in methods under Settings → Security → Connected accounts.'
    };
  }

  if (code === 'identity_already_exists' || text.includes('identity is already linked') || text.includes('already linked')) {
    return {
      title: 'That account is already in use',
      message:
        'This GitHub or GitLab account is already connected to a different TraceIQ account. Sign in to that account instead, or disconnect it there first and then connect it here.'
    };
  }

  if (code === 'manual_linking_disabled' || text.includes('manual linking')) {
    return {
      title: 'Connecting accounts isn’t available yet',
      message: `Connecting GitHub or GitLab to an existing account isn’t turned on for this TraceIQ instance. Contact ${SUPPORT_EMAIL} and we’ll enable it.`
    };
  }

  if (code === 'email_exists' || code === 'user_already_exists' || text.includes('already registered') || text.includes('already exists')) {
    return {
      title: 'An account with this email already exists',
      message:
        'Sign in the way you used before (email and password, GitHub or GitLab). Then connect your other sign-in methods under Settings → Security → Connected accounts.'
    };
  }

  if (code === 'otp_expired' || code === 'flow_state_expired' || code === 'flow_state_not_found' || text.includes('expired')) {
    return {
      title: 'This link has expired',
      message: linking
        ? 'The connection took too long or was opened twice. Go back to Settings and click Connect again.'
        : 'Sign-in and confirmation links only work once, and only for a short time. Go back to sign in and request a new one.'
    };
  }

  if (params.error === 'access_denied') {
    return {
      title: linking ? 'Connection cancelled' : 'Sign-in cancelled',
      message: linking
        ? 'You didn’t approve TraceIQ on GitHub or GitLab, so nothing was connected.'
        : 'You didn’t approve TraceIQ on GitHub or GitLab, so you weren’t signed in. Try again whenever you’re ready.'
    };
  }

  return {
    title: linking ? 'We couldn’t connect that account' : 'We couldn’t complete that sign-in',
    message: `Something went wrong between TraceIQ and the sign-in provider. Try again; if it keeps happening, email ${SUPPORT_EMAIL} with the details below.`,
    details: description || params.code || params.error || undefined
  };
}
