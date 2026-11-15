'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Skeleton } from '@/components/Skeleton';
import { Notice, SettingsCard, SettingsSection } from '../settings/SettingsUI';
import { BriefChannelCard, browserTimezone, takeSlackReturn, useBriefChannels } from './brief-channels';

export function DailyBriefPanel({ projectId }: { projectId?: string }) {
  const briefs = useBriefChannels(projectId, { returnTo: 'alerts' });
  const { status, message } = briefs;

  // Slack sends the person back here with ?slack=<result>. Say what happened, then tidy the URL.
  useEffect(() => {
    takeSlackReturn();
  }, []);

  if (!status) {
    return (
      <div className="grid max-w-4xl gap-4">
        {message ? (
          <Notice tone="error">{message}</Notice>
        ) : (
          [0, 1].map((key) => (
            <div key={key} className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="mt-2 h-3 w-72" />
              <Skeleton className="mt-6 h-9 w-full" />
            </div>
          ))
        )}
      </div>
    );
  }

  const tz = browserTimezone();

  return (
    <div className="grid max-w-4xl gap-12">
      <SettingsSection
        id="brief"
        title="Daily brief"
        description="A short plain-English summary of your project, sent to your chat: what changed, and one thing to look at. Quiet periods send nothing."
      >
        {status.cadence === 'weekly' ? (
          <Notice tone="info">
            <strong className="font-semibold">Your plan sends the brief weekly.</strong> It arrives on Mondays at the time you pick and covers the
            last 7 days. Pro sends it every day.{' '}
            <Link href="/dashboard/settings/billing" className="font-medium underline underline-offset-2">
              Upgrade to Pro
            </Link>
          </Notice>
        ) : null}

        {!status.telegram.configured && !status.slack.configured ? (
          <Notice tone="info">Neither Telegram nor Slack is set up on this TraceIQ server yet, so briefs cannot be sent.</Notice>
        ) : null}
        <BriefChannelCard kind="telegram" briefs={briefs} />
        <BriefChannelCard kind="slack" briefs={briefs} />

        {message ? <Notice tone="error">{message}</Notice> : null}
      </SettingsSection>

      <SettingsSection id="preview" title="What you will get" description="Short enough to read on a lock screen. Revenue appears only if you have turned it on.">
        <SettingsCard>
          <div className="px-5 py-4">
            <div className="max-w-md rounded-2xl rounded-bl-sm bg-neutral-100 px-4 py-3 text-sm leading-6 text-neutral-800 dark:bg-slate-800 dark:text-slate-200">
              <p><strong>{status.project.name}</strong> · your daily brief</p>
              <p className="mt-2">Events are up 24% today (1,320 vs 1,065 yesterday). 71% of activity came from Nigeria.</p>
              <p className="mt-2">1,320 events · 412 visitors<br />Revenue: ₦184,000 · 23 paid · 2 failed</p>
              <p className="mt-2"><strong>Look at this:</strong> Activity is up 24%, 71% from NG. Find out where it came from.</p>
              <p className="mt-2 text-sky-600 dark:text-sky-400 underline">Open TraceIQ</p>
            </div>
            <p className="mt-3 text-xs text-neutral-500 dark:text-slate-400">
              On Telegram, send /brief and choose daily, weekly, monthly or all time, or go straight there with{' '}
              <code className="font-mono">/brief_daily</code>, <code className="font-mono">/brief_weekly</code>,{' '}
              <code className="font-mono">/brief_monthly</code> or <code className="font-mono">/brief_alltime</code>. <code className="font-mono">/stop</code>{' '}
              pauses the scheduled brief. In a private chat with the bot you can also just type a question, like &quot;why did signups drop this week?&quot;, or use <code className="font-mono">/ask</code>. Times use your chosen timezone ({tz} is this browser&apos;s).
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
