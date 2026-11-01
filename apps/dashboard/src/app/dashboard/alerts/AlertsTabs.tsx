import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import Alert02Icon from '@hugeicons/core-free-icons/Alert02Icon';
import SentIcon from '@hugeicons/core-free-icons/SentIcon';

const tabs = [
  { id: 'alerts', href: '/dashboard/alerts', label: 'Alerts', icon: Alert02Icon },
  { id: 'brief', href: '/dashboard/alerts?tab=brief', label: 'Daily brief', icon: SentIcon }
] as const;

export type AlertsTab = (typeof tabs)[number]['id'];

export function AlertsTabs({ active }: { active: AlertsTab }) {
  return (
    <nav aria-label="Alerts sections" className="-mx-1 mb-6 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 dark:border-slate-800">
      {tabs.map((tab) => {
        const current = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={tab.href}
            aria-current={current ? 'page' : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition ${
              current
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
