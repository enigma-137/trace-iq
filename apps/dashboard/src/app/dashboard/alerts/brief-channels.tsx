'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { SlackLogo, TelegramLogo } from '@/components/BrandLogos';
import { SettingsCard, SettingsRow, StatusPill, Switch, dangerButton, inputClass, primaryButton, secondaryButton } from '../settings/SettingsUI';

/**
 * The daily brief's Slack and Telegram chats, shared by the Alerts page (Daily brief tab)
 * and Settings → Integrations, so both connect, edit and disconnect the same way.
 */

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const POLL_MS = 3000;
const POLL_LIMIT_MS = 15 * 60 * 1000;

export type BriefKind = 'telegram' | 'slack';
/** Where Slack sends the person back to after they pick a channel. */
export type SlackReturnPage = 'alerts' | 'integrations';

export interface BriefChannel {
  id: string;
  kind: BriefKind;
  chatName: string | null;
  enabled: boolean;
  sendHour: number;
  timezone: string;
  lastSentOn: string | null;
  lastError: string | null;
}

export interface BriefOverview {
  project: { id: string; name: string };
  telegram: { configured: boolean; botUsername: string | null };
  slack: { configured: boolean };
  /** Weekly on the Free plan (Mondays, last 7 days), daily on Pro. Absent from an older API. */
  cadence?: 'daily' | 'weekly';
  channels: BriefChannel[];
}

export interface TelegramLink {
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
export const briefServiceName = (kind: BriefKind) => (kind === 'slack' ? 'Slack' : 'Telegram');

export function browserTimezone() {
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

/** Reads `?slack=<result>` once, toasts what happened and removes it from the URL. Returns the result. */
export function takeSlackReturn(): string | null {
  const params = new URLSearchParams(window.location.search);
  const result = params.get('slack');
  if (!result) return null;
  const outcome = SLACK_RESULTS[result] ?? SLACK_RESULTS.error;
  if (outcome.tone === 'success') toast.success(outcome.text, { title: outcome.title });
  else toast.error(outcome.text, { title: outcome.title });
  params.delete('slack');
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  return result;
}

export function useBriefChannels(projectId: string | undefined, { returnTo = 'alerts' }: { returnTo?: SlackReturnPage } = {}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [status, setStatus] = useState<BriefOverview>();
  const [message, setMessage] = useState('');
  const [link, setLink] = useState<TelegramLink | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const pollUntil = useRef(0);
  const telegramCount = useRef(0);

  const request = useCallback(
    async (path: string, init?: RequestInit) => {
      const access = (await supabase.auth.getSession()).data.session?.access_token;
      if (!access) throw new Error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${access}`, ...(init?.body ? { 'content-type': 'application/json' } : {}) }
      });
      if (!response.ok) throw new Error(await readApiError(response));
      return response.json();
    },
    [supabase]
  );

  const overviewPath = `/v1/dashboard/briefs${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;

  const load = useCallback(async () => {
    try {
      setStatus((await request(overviewPath)) as BriefOverview);
    } catch (error) {
      setMessage(await readApiError(error, 'The daily brief settings could not be loaded.'));
    }
  }, [request, overviewPath]);

  useEffect(() => {
    void load();
  }, [load]);

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
      const next = (await request(overviewPath).catch(() => null)) as BriefOverview | null;
      if (next && next.channels.filter((channel) => channel.kind === 'telegram').length > telegramCount.current) {
        window.clearInterval(timer);
        setStatus(next);
        setLink(null);
        toast.success('Your first brief is on its way.', { title: 'Telegram connected' });
      }
    }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [link, request, overviewPath]);

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
    const created = await run(
      'connect-telegram',
      () =>
        request('/v1/dashboard/briefs/telegram/link', {
          method: 'POST',
          body: JSON.stringify({ projectId: status?.project.id ?? projectId, timezone: browserTimezone() })
        }) as Promise<TelegramLink>,
      'Could not start the Telegram connection'
    );
    if (created) setLink(created);
  }

  async function connectSlack() {
    const created = await run(
      'connect-slack',
      () =>
        request('/v1/dashboard/briefs/slack/link', {
          method: 'POST',
          body: JSON.stringify({ projectId: status?.project.id ?? projectId, timezone: browserTimezone(), returnTo })
        }) as Promise<{ url: string }>,
      'Could not start the Slack connection'
    );
    // Slack's own screen asks which channel to use, then sends the person back to `returnTo`.
    if (created) window.location.assign(created.url);
  }

  async function update(channel: BriefChannel, patch: Partial<Pick<BriefChannel, 'enabled' | 'sendHour' | 'timezone'>>) {
    const saved = await run(
      channel.id,
      () => request(`/v1/dashboard/briefs/channels/${channel.id}`, { method: 'PUT', body: JSON.stringify(patch) }) as Promise<BriefChannel>,
      'Could not save the change'
    );
    if (saved) setStatus((current) => current && { ...current, channels: current.channels.map((item) => (item.id === saved.id ? saved : item)) });
  }

  async function sendNow(channel: BriefChannel) {
    const sent = await run(`test-${channel.id}`, () => request(`/v1/dashboard/briefs/channels/${channel.id}/test`, { method: 'POST' }), 'Could not send the brief');
    if (sent) toast.success(`Check ${briefServiceName(channel.kind)}.`, { title: 'Brief sent' });
  }

  async function disconnect(channel: BriefChannel) {
    if (!window.confirm(`Stop sending briefs to ${channel.chatName ?? 'this chat'}?`)) return;
    const removed = await run(`delete-${channel.id}`, () => request(`/v1/dashboard/briefs/channels/${channel.id}`, { method: 'DELETE' }), 'Could not disconnect');
    if (removed) setStatus((current) => current && { ...current, channels: current.channels.filter((item) => item.id !== channel.id) });
  }

  return { status, message, link, busy, load, connectTelegram, connectSlack, update, sendNow, disconnect };
}

export type BriefChannels = ReturnType<typeof useBriefChannels>;

function ChannelRows({ briefs, channels }: { briefs: BriefChannels; channels: BriefChannel[] }) {
  const { busy, update, sendNow, disconnect } = briefs;
  const tz = browserTimezone();
  return (
    <>
      {channels.map((channel) => (
        <div key={channel.id} className="border-t border-neutral-100 dark:border-slate-800">
          <SettingsRow
            label={channel.chatName ?? `${briefServiceName(channel.kind)} chat`}
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
              <Switch
                label={`Send daily briefs to ${channel.chatName ?? 'this chat'}`}
                checked={channel.enabled}
                onChange={(enabled) => update(channel, { enabled })}
                disabled={busy === channel.id}
              />
              <select
                aria-label="Send time"
                className={`${inputClass} w-auto`}
                value={channel.sendHour}
                onChange={(event) => update(channel, { sendHour: Number(event.target.value) })}
                disabled={busy === channel.id}
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {formatHour(hour)}
                  </option>
                ))}
              </select>
              <select
                aria-label="Timezone"
                className={`${inputClass} w-auto max-w-[220px]`}
                value={channel.timezone}
                onChange={(event) => update(channel, { timezone: event.target.value })}
                disabled={busy === channel.id}
              >
                {timezoneOptions(channel.timezone === 'UTC' ? tz : channel.timezone).map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </div>
          </SettingsRow>
        </div>
      ))}
    </>
  );
}

/** The Telegram or Slack card: connect button, the Telegram link while waiting, and each chat's settings. */
export function BriefChannelCard({ kind, briefs }: { kind: BriefKind; briefs: BriefChannels }) {
  const { status, busy, link, connectTelegram, connectSlack } = briefs;
  if (!status) return null;
  const channels = status.channels.filter((channel) => channel.kind === kind);
  const connected = channels.length > 0;
  const pill = (
    <StatusPill tone={connected ? 'success' : 'neutral'}>{connected ? 'Connected' : 'Not connected'}</StatusPill>
  );

  if (kind === 'telegram') {
    return (
      <SettingsCard
        iconNode={<TelegramLogo size={20} />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Telegram
            {pill}
          </span>
        }
        description={
          connected
            ? `Briefs for ${status.project.name} go to the chats below.`
            : 'Connect a chat and the first brief arrives straight away, so you can see what to expect.'
        }
        actions={
          status.telegram.configured ? (
            <button
              type="button"
              className={connected ? secondaryButton : primaryButton}
              onClick={connectTelegram}
              disabled={busy === 'connect-telegram' || Boolean(link)}
            >
              {busy === 'connect-telegram' ? 'Preparing…' : connected ? 'Add another chat' : 'Connect Telegram'}
            </button>
          ) : null
        }
      >
        {!status.telegram.configured ? (
          <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-500 dark:border-slate-800 dark:text-slate-400">
            Telegram is not set up on this TraceIQ server yet.
          </p>
        ) : null}
        {link ? (
          <div className="border-t border-neutral-100 px-5 py-4 dark:border-slate-800">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">1. Open Telegram and tap Start</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <a className={primaryButton} href={link.url} target="_blank" rel="noreferrer">
                Open Telegram
              </a>
              <a className={secondaryButton} href={link.groupUrl} target="_blank" rel="noreferrer">
                Add to a group instead
              </a>
            </div>
            <p className="mt-3 text-sm text-neutral-500 dark:text-slate-400" role="status">
              2. Waiting for you to tap Start in {status.telegram.botUsername ? `@${status.telegram.botUsername}` : 'the bot'}. This page updates by
              itself. The link works once and expires in 15 minutes.
            </p>
          </div>
        ) : null}
        <ChannelRows briefs={briefs} channels={channels} />
      </SettingsCard>
    );
  }

  return (
    <SettingsCard
      iconNode={<SlackLogo size={20} />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Slack
          {pill}
        </span>
      }
      description={
        connected
          ? `Briefs for ${status.project.name} are posted to the channels below.`
          : 'Pick a channel on Slack and the brief is posted there. You choose the channel on Slack, and TraceIQ can only post to that one.'
      }
      actions={
        status.slack.configured ? (
          <button type="button" className={connected ? secondaryButton : primaryButton} onClick={connectSlack} disabled={busy === 'connect-slack'}>
            {busy === 'connect-slack' ? 'Opening Slack…' : connected ? 'Add another channel' : 'Add to Slack'}
          </button>
        ) : null
      }
    >
      {!status.slack.configured ? (
        <p className="border-t border-neutral-100 px-5 py-4 text-sm text-neutral-500 dark:border-slate-800 dark:text-slate-400">
          Slack is not set up on this TraceIQ server yet.
        </p>
      ) : null}
      <ChannelRows briefs={briefs} channels={channels} />
    </SettingsCard>
  );
}
