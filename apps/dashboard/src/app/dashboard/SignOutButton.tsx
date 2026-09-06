'use client';

import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import Logout02Icon from '@hugeicons/core-free-icons/Logout02Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

interface SignOutButtonProps {
  iconOnly?: boolean;
}

export function SignOutButton({ iconOnly = false }: SignOutButtonProps) {
  const router = useRouter();

  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return null;
  }

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  return (
    <button
      className={`inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${
        iconOnly
          ? 'size-8 text-neutral-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400'
          : 'h-8 px-2.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 dark:text-slate-300 dark:hover:text-white'
      }`}
      type="button"
      onClick={handleSignOut}
      title="Sign out"
      aria-label="Sign out"
    >
      <HugeiconsIcon
        icon={Logout02Icon}
        size={16}
        strokeWidth={1.8}
        className={iconOnly ? '' : 'mr-1.5'}
        aria-hidden="true"
      />
      {!iconOnly && <span>Sign out</span>}
    </button>
  );
}
