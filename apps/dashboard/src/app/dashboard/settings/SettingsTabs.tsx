'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/dashboard/settings', label: 'Overview' },
  { href: '/dashboard/settings/billing', label: 'Billing' },
  { href: '/dashboard/settings/replay', label: 'Session Replay' },
  { href: '/dashboard/settings/team', label: 'Team' }
];

export function SettingsTabs() {
  const pathname = usePathname();
  const visibleTabs = process.env.NEXT_PUBLIC_AUTH_MODE === 'local' ? tabs.filter((tab) => tab.label !== 'Team') : tabs;

  return (
    <nav
      aria-label="Settings sections"
      className="mt-6 flex gap-1 border-b border-neutral-200 dark:border-slate-800"
    >
      {visibleTabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              active
                ? 'border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:text-neutral-800 dark:text-slate-400 dark:hover:text-slate-200'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
