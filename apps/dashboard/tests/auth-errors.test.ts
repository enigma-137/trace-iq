import { describe, expect, it } from 'vitest';
import { describeAuthError, readAuthErrorParams } from '../src/lib/auth-errors';

describe('readAuthErrorParams', () => {
  it('reads the error Supabase puts in the URL fragment', () => {
    const hash =
      '#error=server_error&error_code=unexpected_failure&error_description=Multiple+accounts+with+the+same+email+address+in+the+same+linking+domain+detected%3A+default&sb=';
    expect(readAuthErrorParams('', hash)).toEqual({
      error: 'server_error',
      code: 'unexpected_failure',
      description: 'Multiple accounts with the same email address in the same linking domain detected: default'
    });
  });

  it('falls back to the query string, and prefers the fragment when both are set', () => {
    expect(readAuthErrorParams('?error=access_denied&error_code=otp_expired', '')).toEqual({
      error: 'access_denied',
      code: 'otp_expired',
      description: null
    });
    expect(readAuthErrorParams('?error_code=from_query', '#error_code=from_hash').code).toBe('from_hash');
  });
});

describe('describeAuthError', () => {
  const describe_ = (code: string | null, description: string | null, error: string | null = null, linking = false) =>
    describeAuthError({ error, code, description }, linking);

  it('explains duplicate accounts and points to Connected accounts', () => {
    const copy = describe_('unexpected_failure', 'Multiple accounts with the same email address in the same linking domain detected: default');
    expect(copy.title).toBe('This email is linked to more than one account');
    expect(copy.message).toContain('Settings → Security → Connected accounts');
    expect(copy.details).toBeUndefined();
  });

  it('explains an identity already linked to another user', () => {
    expect(describe_('identity_already_exists', 'Identity is already linked to another user', null, true).title).toBe('That account is already in use');
  });

  it('explains expired links differently when connecting from Settings', () => {
    expect(describe_('otp_expired', 'Email link is invalid or has expired', 'access_denied').title).toBe('This link has expired');
    expect(describe_('flow_state_expired', null, null, true).message).toContain('click Connect again');
  });

  it('explains a cancelled sign-in', () => {
    expect(describe_(null, 'The resource owner or authorization server denied the request', 'access_denied').title).toBe('Sign-in cancelled');
  });

  it('falls back to a generic message that shows the provider’s wording', () => {
    const copy = describe_('unexpected_failure', 'Something odd happened');
    expect(copy.title).toBe('We couldn’t complete that sign-in');
    expect(copy.details).toBe('Something odd happened');
    expect(describe_(null, null, null, true).title).toBe('We couldn’t connect that account');
  });
});
