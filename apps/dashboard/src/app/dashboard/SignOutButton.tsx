'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import Logout02Icon from '@hugeicons/core-free-icons/Logout02Icon';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from './DashboardDialog';

interface SignOutButtonProps {
  iconOnly?: boolean;
}

export function SignOutButton({ iconOnly = false }: SignOutButtonProps) {
  const router = useRouter();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  if (process.env.NEXT_PUBLIC_AUTH_MODE === 'local') {
    return null;
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push('/auth/login');
    router.refresh();
  }

  function closeConfirm() {
    if (!isSigningOut) {
      setIsConfirming(false);
    }
  }

  return (
    <>
      <button
        className={`inline-flex items-center justify-center rounded-md border border-neutral-300 bg-white text-neutral-900 transition hover:bg-neutral-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${
          iconOnly
            ? 'size-8 text-neutral-500 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400'
            : 'h-8 px-2.5 text-xs font-semibold text-neutral-700 hover:text-neutral-900 dark:text-slate-300 dark:hover:text-white'
        }`}
        type="button"
        onClick={() => setIsConfirming(true)}
        title="Sign out"
        aria-label="Sign out"
      >
        <HugeiconsIcon icon={Logout02Icon} size={16} strokeWidth={1.8} className={iconOnly ? '' : 'mr-1.5'} aria-hidden="true" />
        {!iconOnly && <span>Sign out</span>}
      </button>

      {/* Portaled to <body> so the mobile drawer can't confine the fixed overlay. */}
      {isConfirming &&
        createPortal(
          <DashboardDialog
            open
            title="Sign out?"
            description="You'll need to sign in again to get back to your dashboard."
            maxWidthClass="max-w-sm"
            onClose={closeConfirm}
            footer={
              <>
                <button
                  type="button"
                  onClick={closeConfirm}
                  disabled={isSigningOut}
                  className="h-9 rounded-lg border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  autoFocus
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                  className="h-9 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-red-500"
                >
                  {isSigningOut ? 'Signing out…' : 'Sign out'}
                </button>
              </>
            }
          />,
          document.body
        )}
    </>
  );
}
