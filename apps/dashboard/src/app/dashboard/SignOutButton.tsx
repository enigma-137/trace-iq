'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <button
      className="min-h-12 min-w-28 rounded-lg border border-slate-950 bg-white px-4 font-extrabold text-slate-950 transition hover:bg-slate-100"
      type="button"
      onClick={handleSignOut}
    >
      Sign out
    </button>
  );
}
