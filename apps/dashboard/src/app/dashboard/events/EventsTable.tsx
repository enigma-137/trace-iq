'use client';

import { useState } from 'react';
import { formatEventName as formatRawEventName } from '@/lib/metrics';

export interface RecentEvent {
  id: string;
  projectId: string;
  userId?: string | null;
  externalUserId?: string | null;
  anonymousId?: string | null;
  sessionId?: string | null;
  eventName: string;
  properties?: Record<string, unknown>;
  deviceInfo?: Record<string, unknown>;
  networkInfo?: Record<string, unknown>;
  context?: Record<string, unknown>;
  occurredAt?: string;
  receivedAt?: string;
}

export function EventsTable({ events }: { events: RecentEvent[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-neutral-300 bg-neutral-50 p-6 dark:border-slate-700 dark:bg-slate-900/40">
        <h3 className="text-base font-semibold text-neutral-900 dark:text-white">Waiting for the first event</h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500 dark:text-slate-400">
          Once the SDK is installed and <code className="font-mono">track()</code> runs, the newest events show here. Click a
          row to inspect the full payload.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-slate-800">
      <div className="hidden grid-cols-[24px_1.4fr_1.2fr_1.2fr_1fr] gap-4 border-b border-neutral-200 bg-neutral-50 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-neutral-400 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-500 lg:grid">
        <span />
        <span>Event</span>
        <span>User</span>
        <span>Session</span>
        <span>Received</span>
      </div>

      <div className="divide-y divide-neutral-200 dark:divide-slate-800">
        {events.map((event) => {
          const isOpen = openId === event.id;
          return (
            <div key={event.id}>
              <button
                type="button"
                onClick={() => setOpenId(isOpen ? null : event.id)}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[24px_1fr] gap-3 px-4 py-3 text-left transition hover:bg-neutral-50 lg:grid-cols-[24px_1.4fr_1.2fr_1.2fr_1fr] lg:gap-4 dark:hover:bg-slate-900/40"
              >
                <span className="pt-0.5 text-neutral-400 dark:text-slate-500">
                  <Chevron open={isOpen} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-neutral-900 dark:text-white">{formatEventName(event)}</span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-neutral-400 dark:text-slate-500 lg:hidden">
                    {formatDate(event.receivedAt)}
                  </span>
                </span>
                <span className="hidden min-w-0 flex-col items-start lg:flex">
                  <span className="block w-full truncate font-mono text-sm text-neutral-700 dark:text-slate-300">
                    {event.externalUserId ?? event.userId ?? event.anonymousId ?? 'anonymous'}
                  </span>
                  {deviceLocationSummary(event) ? (
                    <span className="mt-0.5 block w-full truncate text-xs text-neutral-400 dark:text-slate-500">
                      {deviceLocationSummary(event)}
                    </span>
                  ) : null}
                </span>
                <span className="hidden min-w-0 items-start lg:flex">
                  <span className="w-full min-w-0 truncate font-mono text-sm text-neutral-500 dark:text-slate-400">
                    {event.sessionId ?? 'none'}
                  </span>
                </span>
                <span className="hidden items-start text-sm text-neutral-500 dark:text-slate-400 lg:flex">
                  {formatDate(event.receivedAt)}
                </span>
              </button>

              {isOpen ? <EventDetail event={event} /> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RESERVED_EVENT_LABELS: Record<string, string> = {
  $page: 'Page view',
  $api_request: 'Api request',
  $exception: 'Exception',
  $rageclick: 'Rage click',
  $identify: 'Identify',
  $group: 'Group'
};

function formatEventName(event: RecentEvent): string {
  const props = event.properties ?? {};
  const reservedLabel = RESERVED_EVENT_LABELS[event.eventName];
  const label = reservedLabel ?? formatRawEventName(event.eventName);

  let detail: string | undefined;
  switch (event.eventName) {
    case '$page':
      detail = humanizePath(props.name ?? props.path);
      break;
    case '$api_request':
      detail = humanizePath(props.path ?? props.url);
      break;
    case '$exception':
      detail = truncate(String(props.message ?? props.type ?? ''), 48);
      break;
    default:
      break;
  }

  return detail ? `${label} (${detail})` : label;
}

function humanizePath(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  let path = value.split('?')[0];
  path = path.replace(/^https?:\/\/[^/]+/, '');
  path = path.replace(/^\/+|\/+$/g, '');
  if (!path) return undefined;
  return path
    .split('/')
    .map((segment) => segment.replace(/[-_]+/g, ' ').trim())
    .filter(Boolean)
    .join(' / ');
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function EventDetail({ event }: { event: RecentEvent }) {
  const identity: Record<string, unknown> = {
    event_id: event.id,
    event_name: event.eventName,
    user_id: event.userId ?? undefined,
    external_user_id: event.externalUserId ?? undefined,
    anonymous_id: event.anonymousId ?? undefined,
    session_id: event.sessionId ?? undefined,
    occurred_at: event.occurredAt,
    received_at: event.receivedAt
  };

  return (
    <div className="border-t border-neutral-200 bg-neutral-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/40">
      <div className="grid gap-5 lg:grid-cols-2">
        <KeyValueList title="Identity & timing" data={identity} />
        <KeyValueList title="Properties" data={event.properties} />
        <KeyValueList title="Device" data={event.deviceInfo} />
        <KeyValueList title="Network" data={event.networkInfo} />
        <KeyValueList title="Context" data={event.context} />
      </div>
    </div>
  );
}

function KeyValueList({ title, data }: { title: string; data?: Record<string, unknown> }) {
  const entries = Object.entries(data ?? {}).filter(([, value]) => value !== undefined && value !== null && value !== '');

  if (entries.length === 0) {
    return null;
  }

  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500">{title}</p>
      <div className="divide-y divide-neutral-200 overflow-hidden rounded-md border border-neutral-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-950">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start justify-between gap-4 px-3 py-2">
            <span className="shrink-0 font-mono text-xs text-neutral-500 dark:text-slate-400">{key}</span>
            <span className="flex min-w-0 items-center gap-2">
              <code className="break-all text-right font-mono text-xs text-neutral-900 dark:text-slate-100">{formatValue(value)}</code>
              <TypeBadge value={value} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TypeBadge({ value }: { value: unknown }) {
  const type =
    Array.isArray(value) || (typeof value === 'object' && value !== null)
      ? 'OBJECT'
      : (typeof value).toUpperCase();
  return (
    <span className="shrink-0 rounded border border-neutral-200 px-1 py-0.5 text-[9px] font-semibold tracking-wide text-neutral-400 dark:border-slate-700 dark:text-slate-500">
      {type}
    </span>
  );
}

function deviceLocationSummary(event: RecentEvent): string {
  const device = event.deviceInfo ?? {};
  const network = event.networkInfo ?? {};
  const deviceBit = [device.os, device.deviceType].filter(Boolean).join(' · ');
  const locationBit = [network.city, network.country].filter(Boolean).join(', ');
  return [deviceBit, locationBit].filter(Boolean).join('  ·  ');
}

function formatValue(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return String(value);
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      className={`transition-transform ${open ? 'rotate-90' : ''}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatDate(value?: string) {
  if (!value) return 'unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
