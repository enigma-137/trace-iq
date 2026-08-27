import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

export function createSupabaseBrowserClient(): SupabaseClient {
  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return createLocalBrowserClient() as unknown as SupabaseClient;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase dashboard environment variables.');
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

function createLocalBrowserClient() {
  const unsupported = async () => ({ data: null, error: new Error('This action requires external authentication.') });
  return {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 'traceiq-local' } }, error: null }),
      getUser: async () => ({
        data: { user: { id: 'traceiq-local-owner', email: 'local@traceiq.invalid' } },
        error: null
      }),
      signOut: async () => ({ error: null }),
      signInWithPassword: unsupported,
      signUp: unsupported,
      resetPasswordForEmail: unsupported,
      verifyOtp: unsupported,
      mfa: {
        listFactors: async () => ({ data: { all: [], totp: [], phone: [] }, error: null }),
        getAuthenticatorAssuranceLevel: async () => ({
          data: { currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] },
          error: null
        }),
        enroll: unsupported,
        challenge: unsupported,
        verify: unsupported,
        challengeAndVerify: unsupported,
        unenroll: unsupported
      }
    }
  };
}
