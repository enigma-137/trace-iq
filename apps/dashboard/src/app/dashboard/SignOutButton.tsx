'use client';

import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

interface SignOutButtonProps {
  iconOnly?: boolean;
}

export function SignOutButton({ iconOnly = false }: SignOutButtonProps) {
  const router = useRouter();

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
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={iconOnly ? '' : 'mr-1.5'}
      >
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
      {!iconOnly && <span>Sign out</span>}
    </button>
  );
}
