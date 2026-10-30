'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HugeiconsIcon } from '@hugeicons/react';
import Settings02Icon from '@hugeicons/core-free-icons/Settings02Icon';
import MagicWand01Icon from '@hugeicons/core-free-icons/MagicWand01Icon';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import PlayCircleIcon from '@hugeicons/core-free-icons/PlayCircleIcon';
import UserGroupIcon from '@hugeicons/core-free-icons/UserGroupIcon';
import Coins01Icon from '@hugeicons/core-free-icons/Coins01Icon';

const tabs = [
  { href: '/dashboard/settings', label: 'Overview', icon: Settings02Icon },
  { href: '/dashboard/setup', label: 'Setup Wizard', icon: MagicWand01Icon },
  { href: '/dashboard/settings/billing', label: 'Billing', icon: CreditCardIcon },
  { href: '/dashboard/settings/replay', label: 'Session Replay', icon: PlayCircleIcon },
  { href: '/dashboard/settings/revenue', label: 'Revenue', icon: Coins01Icon },
  { href: '/dashboard/settings/team', label: 'Team', icon: UserGroupIcon }
];

export function SettingsTabs() {
  const pathname = usePathname();
  const visibleTabs = process.env.NEXT_PUBLIC_AUTH_MODE === 'local' ? tabs.filter((tab) => tab.label !== 'Team') : tabs;

  return (
    <nav
      aria-label="Settings sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 dark:border-slate-800"
    >
      {visibleTabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition ${
              active
                ? 'border-neutral-900 font-medium text-neutral-900 dark:border-white dark:text-white'
                : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-900 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-100'
            }`}
          >
            <HugeiconsIcon icon={tab.icon} size={16} strokeWidth={1.8} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
