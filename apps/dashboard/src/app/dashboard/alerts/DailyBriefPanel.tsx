'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import SentIcon from '@hugeicons/core-free-icons/SentIcon';
import SlackIcon from '@hugeicons/core-free-icons/SlackIcon';
import { Skeleton } from '@/components/Skeleton';
import {
  Notice,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  StatusPill,
  Switch,
  dangerButton,
  inputClass,
  primaryButton,
  secondaryButton
} from '../settings/SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_MS = 3000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

type Kind = 'telegram' | 'slack';

interface Channel {
  id: string;
  kind: Kind;
  chatName: string | null;
  enabled: boolean;
  sendHour: number;
  timezone: string;
  lastSentOn: string | null;
  lastError: string | null;
}

interface Overview {
  project: { id: string; name: string };
  telegram: { configured: boolean; botUsername: string | null };
  slack: { configured: boolean };
  channels: Channel[];
}

interface Link {
  url: string;
  groupUrl: string;
  expiresAt: string;
}

const SLACK_RESULTS: Record<string, { tone: 'success' | 'error'; title: string; text: string }> = {
  connected: { tone: 'success', title: 'Slack connected', text: 'Your first brief is on its way to the channel.' },
  cancelled: { tone: 'error', title: 'Slack not connected', text: 'You cancelled on Slack, so nothing was added.' },
  expired: { tone: 'error', title: 'That link expired', text: 'Start again with Add to Slack. Each link works once and lasts 15 minutes.' },
  error: { tone: 'error', title: 'Slack not connected', text: 'Slack did not complete the connection. Try Add to Slack again.' }
};

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const formatHour = (hour: number) => `${String(hour).padStart(2, '0')}:00`;
const serviceName = (kind: Kind) => (kind === 'slack' ? 'Slack' : 'Telegram');

function browserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function timezoneOptions(current: string) {
  let zones: string[] = [];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  return Array.from(new Set(['UTC', current, ...zones]));
}

export function DailyBriefPanel({ projectId }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<Overview>();
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<Link | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollUntil = useRef(0);
  const telegramCount = useRef(0);

  useEffect(() => { void load(); }, [projectId]);

  // Slack sends the person back here with ?slack=<result>. Say what happened, then tidy the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('slack');
    if (!result) return;
    const outcome = SLACK_RESULTS[result] ?? SLACK_RESULTS.error;
    if (outcome.tone === 'success') toast.success(outcome.text, { title: outcome.title });
    else toast.error(outcome.text, { title: outcome.title });
    params.delete('slack');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, []);

  // After a Telegram link is made, check every few seconds for the chat to appear.
  useEffect(() => {
    if (!link) return;
    pollUntil.current = Date.now() + POLL_LIMIT_MS;
    const timer = window.setInterval(async () => {
      if (Date.now() > pollUntil.current) {
        window.clearInterval(timer);
        setLink(null);
        return;
      }
      const next = await fetchStatus();
      if (next && next.channels.filter((channel) => channel.kind === 'telegram').length > telegramCount.current) {
        window.clearInterval(timer);
        setStatus(next);
        setLink(null);
        toast.success('Your first brief is on its way.', { title: 'Telegram connected' });
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [link]);

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }

  async function request(path: string, init?: RequestInit) {
    const access = await token();
    if (!access) throw new Error('Your dashboard session expired. Sign in again.');
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${access}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) }
    });
    if (!response.ok) throw new Error(await readApiError(response));
    return response.json();
  }

  const overviewPath = `/v1/dashboard/briefs${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;

  async function fetchStatus(): Promise<Overview | null> {
    try {
      return (await request(overviewPath)) as Overview;
    } catch {
      return null;
    }
  }

  async function load() {
    try {
      setStatus((await request(overviewPath)) as Overview);
    } catch (error) {
      setMessage(await readApiError(error, 'The daily brief settings could not be loaded.'));
    }
  }

  async function run<T>(key: string, action: () => Promise<T>, failure: string): Promise<T | undefined> {
    setBusy(key);
    setMessage('');
    try {
      return await action();
    } catch (error) {
      const text = await readApiError(error, failure);
      setMessage(text);
      toast.error(text, { title: failure });
    } finally {
      setBusy(null);
    }
  }

  async function connectTelegram() {
    telegramCount.current = status?.channels.filter((channel) => channel.kind === 'telegram').length ?? 0;
    const created = await run('connect-telegram', () =>
      request('/v1/dashboard/briefs/telegram/link', {
        method: 'POST',
        body: JSON.stringify({ projectId: status?.project.id ?? projectId, timezone: browserTimezone() })
      }) as Promise<Link>,
      'Could not start the Telegram connection'
    );
    if (created) setLink(created);
  }

  async function connectSlack() {
    const created = await run('connect-slack', () =>
      request('/v1/dashboard/briefs/slack/link', {
        method: 'POST',
        body: JSON.stringify({ projectId: status?.project.id ?? projectId, timezone: browserTimezone() })
      }) as Promise<{ url: string }>,
      'Could not start the Slack connection'
    );
    // Slack's own screen asks which channel to use, then sends the person back here.
    if (created) window.location.assign(created.url);
  }

  async function update(channel: Channel, patch: Partial<Pick<Channel, 'enabled' | 'sendHour' | 'timezone'>>) {
    const saved = await run(channel.id, () =>
      request(`/v1/dashboard/briefs/channels/${channel.id}`, { method: 'PUT', body: JSON.stringify(patch) }) as Promise<Channel>,
      'Could not save the change'
    );
    if (saved && status) setStatus({ ...status, channels: status.channels.map((item) => (item.id === saved.id ? saved : item)) });
  }

  async function sendNow(channel: Channel) {
    const sent = await run(`test-${channel.id}`, () => request(`/v1/dashboard/briefs/channels/${channel.id}/test`, { method: 'POST' }), 'Could not send the brief');
    if (sent) toast.success(`Check ${serviceName(channel.kind)}.`, { title: 'Brief sent' });
  }

  async function disconnect(channel: Channel) {
    if (!window.confirm(`Stop sending briefs to ${channel.chatName ?? 'this chat'}?`)) return;
    const removed = await run(`delete-${channel.id}`, () => request(`/v1/dashboard/briefs/channels/${channel.id}`, { method: 'DELETE' }), 'Could not disconnect');
    if (removed && status) setStatus({ ...status, channels: status.channels.filter((item) => item.id !== channel.id) });
  }

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
  const telegramChannels = status.channels.filter((channel) => channel.kind === 'telegram');
  const slackChannels = status.channels.filter((channel) => channel.kind === 'slack');

  const channelRows = (channels: Channel[]) =>
    channels.map((channel) => (
      <div key={channel.id} className="border-t border-neutral-100 dark:border-slate-800">
        <SettingsRow
          label={channel.chatName ?? `${serviceName(channel.kind)} chat`}
          hint={channel.lastError ? `Stopped: ${channel.lastError}` : channel.lastSentOn ? `Last brief ${channel.lastSentOn}` : 'No brief sent yet'}
          actions={
            <>
              <button type="button" className={secondaryButton} onClick={() => sendNow(channel)} disabled={busy === `test-${channel.id}`}>
                {busy === `test-${channel.id}` ? 'Sending…' : 'Send now'}
              </button>
              <button type="button" className={dangerButton} onClick={() => disconnect(channel)} disabled={busy === `delete-${channel.id}`}>
                Disconnect
              </button>
            </>
          }
        >
          <div className="flex flex-wrap items-center gap-3">
            <Switch label={`Send daily briefs to ${channel.chatName ?? 'this chat'}`} checked={channel.enabled} onChange={(enabled) => update(channel, { enabled })} disabled={busy === channel.id} />
            <label className="flex items-center gap-2 text-sm">
              <span className="sr-only">Send time</span>
              <select
                aria-label="Send time"
                className={`${inputClass} w-auto`}
                value={channel.sendHour}
                onChange={(event) => update(channel, { sendHour: Number(event.target.value) })}
                disabled={busy === channel.id}
              >
                {HOURS.map((hour) => <option key={hour} value={hour}>{formatHour(hour)}</option>)}
              </select>
            </label>
            <select
              aria-label="Timezone"
              className={`${inputClass} w-auto max-w-[220px]`}
              value={channel.timezone}
              onChange={(event) => update(channel, { timezone: event.target.value })}
              disabled={busy === channel.id}
            >
              {timezoneOptions(channel.timezone === 'UTC' ? tz : channel.timezone).map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </div>
        </SettingsRow>
      </div>
    ));

  return (
    <div className="grid max-w-4xl gap-12">
      <SettingsSection
        id="brief"
        title="Daily brief"
        description="A short plain-English summary of your project, sent to your chat once a day: what changed, and one thing to look at. Quiet days send nothing."
      >
        {!status.telegram.configured && !status.slack.configured ? (
          <Notice tone="info">Neither Telegram nor Slack is set up on this TraceIQ server yet, so briefs cannot be sent.</Notice>
        ) : null}

        <SettingsCard
          icon={SentIcon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Telegram
              <StatusPill tone={telegramChannels.length > 0 ? 'success' : 'neutral'}>{telegramChannels.length > 0 ? 'Connected' : 'Not connected'}</StatusPill>
            </span>
          }
          description={
            telegramChannels.length > 0
              ? `Briefs for ${status.project.name} go to the chats below.`
              : 'Connect a chat and the first brief arrives straight away, so you can see what to expect.'
          }
          actions={
            status.telegram.configured ? (
              <button type="button" className={telegramChannels.length > 0 ? secondaryButton : primaryButton} onClick={connectTelegram} disabled={busy === 'connect-telegram' || Boolean(link)}>
                {busy === 'connect-telegram' ? 'Preparing…' : telegramChannels.length > 0 ? 'Add another chat' : 'Connect Telegram'}
              </button>
            ) : null
          }
        >
          {link ? (
            <div className="border-t border-neutral-100 px-5 py-4 dark:border-slate-800">
              <p className="text-sm font-medium text-neutral-900 dark:text-white">1. Open Telegram and tap Start</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <a className={primaryButton} href={link.url} target="_blank" rel="noreferrer">Open Telegram</a>
                <a className={secondaryButton} href={link.groupUrl} target="_blank" rel="noreferrer">Add to a group instead</a>
              </div>
              <p className="mt-3 text-sm text-neutral-500 dark:text-slate-400" role="status">
                2. Waiting for you to tap Start in {status.telegram.botUsername ? `@${status.telegram.botUsername}` : 'the bot'}. This page updates by itself. The link works once and expires in 15 minutes.
              </p>
            </div>
          ) : null}
          {channelRows(telegramChannels)}
        </SettingsCard>

        <SettingsCard
          icon={SlackIcon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Slack
              <StatusPill tone={slackChannels.length > 0 ? 'success' : 'neutral'}>{slackChannels.length > 0 ? 'Connected' : 'Not connected'}</StatusPill>
            </span>
          }
          description={
            slackChannels.length > 0
              ? `Briefs for ${status.project.name} are posted to the channels below.`
              : 'Pick a channel on Slack and the brief is posted there. You choose the channel on Slack, and TraceIQ can only post to that one.'
          }
          actions={
            status.slack.configured ? (
              <button type="button" className={slackChannels.length > 0 ? secondaryButton : primaryButton} onClick={connectSlack} disabled={busy === 'connect-slack'}>
                {busy === 'connect-slack' ? 'Opening Slack…' : slackChannels.length > 0 ? 'Add another channel' : 'Add to Slack'}
              </button>
            ) : null
          }
        >
          {channelRows(slackChannels)}
        </SettingsCard>

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
              On Telegram, send /brief to the bot any time for one right now, or /stop to pause. Times use your chosen timezone ({tz} is this browser&apos;s).
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>
    </div>
  );
}
