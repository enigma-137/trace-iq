'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowLeft01Icon from '@hugeicons/core-free-icons/ArrowLeft01Icon';
import DashboardSquare01Icon from '@hugeicons/core-free-icons/DashboardSquare01Icon';
import FilterHorizontalIcon from '@hugeicons/core-free-icons/FilterHorizontalIcon';
import Route01Icon from '@hugeicons/core-free-icons/Route01Icon';
import PencilEdit02Icon from '@hugeicons/core-free-icons/PencilEdit02Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import { ThemeToggle } from '../dashboard/ThemeToggle';
import { DEMO_CATEGORIES, DEMO_RANGES } from '@/lib/demo-data';
import { DemoProvider, useDemo } from './DemoContext';
import { CompanyModal } from './CompanyModal';

const NAV = [
  { href: '/demo', label: 'Overview', icon: DashboardSquare01Icon },
  { href: '/demo/funnels', label: 'Funnels', icon: FilterHorizontalIcon },
  { href: '/demo/requests', label: 'Requests', icon: Route01Icon }
];

const SIGNUP_HREF = '/auth/login?mode=signup';

export function DemoShell({ children }: { children: ReactNode }) {
  return (
    <DemoProvider>
      <DemoFrame>{children}</DemoFrame>
    </DemoProvider>
  );
}

function DemoFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { company, ready, range, setRange, modalOpen, openModal } = useDemo();
  const [bannerOpen, setBannerOpen] = useState(true);
  const active = NAV.find((item) => item.href === pathname) ?? NAV[0];

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex min-h-screen w-full">
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-neutral-200 bg-white px-3 py-4 dark:border-slate-800/90 dark:bg-slate-950 lg:flex">
          <Link className="flex items-center gap-2.5 px-1" href="/" aria-label="TraceIQ home">
            <img className="h-7 w-7 dark:hidden" src="/brand/logo-black-no-bg.png" alt="" />
            <img className="hidden h-7 w-7 dark:block" src="/brand/logo-white-no-bg.png" alt="" />
            <span className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white">TraceIQ</span>
          </Link>

          <Link
            href="/"
            className="mt-5 inline-flex items-center gap-1.5 px-1 text-xs font-medium text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} aria-hidden="true" />
            Back to home
          </Link>

          <button
            type="button"
            onClick={openModal}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-neutral-50/60 px-3 py-2 text-left transition hover:bg-neutral-100 dark:border-slate-800/90 dark:bg-slate-900/40 dark:hover:bg-slate-900"
            title="Change the demo company"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">{company?.name ?? 'Your company'}</span>
              <span className="block truncate text-[11px] text-neutral-500 dark:text-slate-400">
                {company ? DEMO_CATEGORIES[company.category].label : 'Pick a category'}
              </span>
            </span>
            <HugeiconsIcon icon={PencilEdit02Icon} size={14} className="shrink-0 text-neutral-400 dark:text-slate-500" aria-hidden="true" />
          </button>

          <nav className="mt-5 grid gap-0.5" aria-label="Demo navigation">
            <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400 dark:text-slate-500">Product</p>
            {NAV.map((item) => {
              const isActive = item === active;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                    isActive
                      ? 'bg-neutral-100 text-neutral-900 dark:bg-slate-900 dark:text-white'
                      : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-900/60 dark:hover:text-white'
                  }`}
                >
                  <HugeiconsIcon icon={item.icon} size={16} strokeWidth={1.8} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto rounded-lg border border-neutral-200 p-3 dark:border-slate-800/90">
            <p className="text-xs font-semibold text-neutral-900 dark:text-white">Like what you see?</p>
            <p className="mt-1 text-[11px] leading-relaxed text-neutral-500 dark:text-slate-400">
              Replays, errors, logs, flags and experiments are in the full product.
            </p>
            <a
              href={SIGNUP_HREF}
              className="mt-2.5 inline-flex h-8 w-full items-center justify-center rounded-md bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Start free
            </a>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/90 backdrop-blur dark:border-slate-800/90 dark:bg-slate-950/90">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:px-8">
              <Link href="/" className="lg:hidden" aria-label="TraceIQ home">
                <img className="h-7 w-7 dark:hidden" src="/brand/logo-black-no-bg.png" alt="" />
                <img className="hidden h-7 w-7 dark:block" src="/brand/logo-white-no-bg.png" alt="" />
              </Link>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight text-neutral-900 dark:text-white">{active.label}</h1>
                <button
                  type="button"
                  onClick={openModal}
                  className="block max-w-[60vw] truncate text-left text-xs text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white lg:hidden"
                >
                  {company?.name ?? 'Your company'} · change
                </button>
              </div>

              <div className="ml-auto flex items-center gap-2">
                <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/50 dark:text-emerald-300 sm:inline-flex">
                  <span className="relative flex size-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
                  </span>
                  Live demo
                </span>
                <ThemeToggle />
                <a
                  href={SIGNUP_HREF}
                  className="inline-flex h-8 items-center rounded-md bg-neutral-900 px-3 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  Start free →
                </a>
              </div>

              <div className="flex w-full flex-wrap items-center justify-between gap-2">
                <nav className="flex gap-1 lg:hidden" aria-label="Demo pages">
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={item === active ? 'page' : undefined}
                      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                        item === active
                          ? 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                          : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800'
                      }`}
                    >
                      {item.label}
                    </Link>
                  ))}
                </nav>
                <div
                  className="ml-auto inline-flex rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-950"
                  role="group"
                  aria-label="Time range"
                >
                  {DEMO_RANGES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRange(option.value)}
                      aria-pressed={option.value === range}
                      className={
                        option.value === range
                          ? 'rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-slate-950'
                          : 'rounded-md px-2.5 py-1 text-xs font-medium text-neutral-600 transition hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </header>

          <div className={`px-4 py-6 md:px-8 xl:px-10 ${bannerOpen ? 'pb-36 sm:pb-28' : ''}`}>
            {ready && company ? children : <DemoSkeleton />}
          </div>
        </section>
      </div>

      {bannerOpen && ready ? (
        <aside
          className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 lg:left-60"
          aria-label="About this demo"
        >
          <div className="flex items-center gap-4 px-4 py-3 md:px-8">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-400 dark:text-slate-500">Live analytics demo</p>
              <p className="mt-0.5 text-sm font-semibold text-neutral-900 dark:text-white">
                Explore a TraceIQ dashboard{company ? ` for ${company.name}` : ''}
              </p>
              <p className="hidden text-xs text-neutral-500 dark:text-slate-400 sm:block">
                Sample data, fully interactive: change the range, open funnels, filter and inspect requests.
              </p>
            </div>
            <a
              href={SIGNUP_HREF}
              className="inline-flex h-9 shrink-0 items-center rounded-md bg-neutral-900 px-4 text-xs font-semibold text-white hover:bg-neutral-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200"
            >
              Start free →
            </a>
            <button
              type="button"
              onClick={() => setBannerOpen(false)}
              className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="Hide demo banner"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={16} aria-hidden="true" />
            </button>
          </div>
        </aside>
      ) : null}

      {ready && modalOpen ? <CompanyModal /> : null}
    </main>
  );
}

function DemoSkeleton() {
  return (
    <div className="mx-auto grid max-w-[1360px] gap-4" aria-hidden="true">
      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="h-36 animate-pulse rounded-xl bg-neutral-100 dark:bg-slate-900" />
        ))}
      </div>
      <div className="h-80 animate-pulse rounded-xl bg-neutral-100 dark:bg-slate-900" />
    </div>
  );
}
