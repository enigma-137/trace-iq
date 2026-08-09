'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { NavIcon } from './NavIcon';
import { SignOutButton } from './SignOutButton';
import { ThemeToggle } from './ThemeToggle';
import { bottomNavItems, navItems, navLinkClass, withProjectId } from './nav';

export function MobileNav({
  active,
  projectId,
  userEmail
}: {
  active: string;
  projectId?: string | null;
  userEmail?: string | null;
}) {
  const [open, setOpen] = useState(false);

  // Lock the page behind the drawer and let Escape dismiss it.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-neutral-200 text-neutral-700 transition hover:bg-neutral-100 dark:border-slate-800 dark:text-slate-200 dark:hover:bg-slate-900 lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      {/* Portaled to <body> so the header's backdrop-blur (which creates a
          containing block for fixed elements) can't confine the drawer. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Dashboard navigation"
          >
            <div className="absolute inset-0 bg-black/40" onClick={close} aria-hidden="true" />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col border-r border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-950">
              <div className="flex items-center justify-between px-4 py-4">
                <Link href="/" className="flex items-center gap-2" onClick={close} aria-label="TraceIQ home">
                  <img className="h-8 w-auto dark:hidden" src="/brand/logo-black-no-bg.png" alt="TraceIQ" />
                  <img className="hidden h-8 w-auto dark:block" src="/brand/logo-white-no-bg.png" alt="TraceIQ" />
                  <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
                </Link>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Close navigation menu"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Dashboard navigation">
                <div className="grid gap-0.5">
                  {navItems.map((item) => (
                    <Link
                      key={item.key}
                      className={navLinkClass(item.key === active)}
                      href={withProjectId(item.href, projectId)}
                      onClick={close}
                    >
                      <NavIcon name={item.key} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </nav>

              <nav
                className="border-t border-neutral-200 px-3 py-3 dark:border-slate-800"
                aria-label="Settings navigation"
              >
                <div className="grid gap-0.5">
                  {bottomNavItems.map((item) => (
                    <Link
                      key={item.key}
                      className={navLinkClass(item.key === active)}
                      href={withProjectId(item.href, projectId)}
                      onClick={close}
                    >
                      <NavIcon name={item.key} />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </nav>

              <div className="border-t border-neutral-200 px-4 py-4 dark:border-slate-800">
                <p className="truncate text-sm font-medium text-neutral-800 dark:text-slate-200">
                  {userEmail ?? 'Account'}
                </p>
                <p className="text-xs text-neutral-400 dark:text-slate-500">Owner workspace</p>
                <div className="mt-3 flex items-center gap-2">
                  <ThemeToggle />
                  <SignOutButton />
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
