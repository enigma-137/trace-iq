'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { buildRevenueSetupPrompt } from '@/lib/revenue-setup-prompt';
import Coins01Icon from '@hugeicons/core-free-icons/Coins01Icon';
import CreditCardIcon from '@hugeicons/core-free-icons/CreditCardIcon';
import AiMagicIcon from '@hugeicons/core-free-icons/AiMagicIcon';
import { Skeleton } from '@/components/Skeleton';
import {
  CopyButton,
  Notice,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  StatusPill,
  Switch,
  inputClass,
  primaryButton,
  secondaryButton
} from '../SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

type Role = 'success' | 'failed' | null;
interface Settings { enabled: boolean; successEvents: string[]; failedEvents: string[]; amountProperty: string; currency: string; }
interface Candidate { name: string; count: number; withAmount: number; suggested: Role; }
interface Summary { total: number; transactions: number; failed: number; }
interface Response { project: { id: string; name: string }; configured: boolean; settings: Settings; candidates: Candidate[]; summary: Summary | null; }

export function RevenueSettingsPanel({ projectId }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<Response>();
  const [settings, setSettings] = useState<Settings>();
  const [extraEvents, setExtraEvents] = useState<string[]>([]);
  const [newEvent, setNewEvent] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { void load(); }, [projectId]);

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }

  function apply(body: Response) {
    setData(body);
    // First visit: pre-select events that look like payments so setup is one review and a save.
    setSettings(body.configured ? body.settings : {
      ...body.settings,
      successEvents: body.candidates.filter((c) => c.suggested === 'success').map((c) => c.name),
      failedEvents: body.candidates.filter((c) => c.suggested === 'failed').map((c) => c.name)
    });
  }

  async function load() {
    const access = await token(); if (!access) return setMessage('Your dashboard session expired.');
    const response = await fetch(`${apiBaseUrl}/v1/dashboard/revenue/settings${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { headers: { Authorization: `Bearer ${access}` } });
    if (!response.ok) return setMessage(await readApiError(response));
    apply(await response.json() as Response);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || saving) return;
    setSaving(true);
    setMessage('');
    try {
      const access = await token();
      if (!access) throw new Error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/revenue/settings`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${access}`, 'content-type': 'application/json' },
        body: JSON.stringify({ ...settings, projectId: data?.project.id ?? projectId })
      });
      if (!response.ok) throw new Error(await readApiError(response));
      apply(await response.json() as Response);
      setExtraEvents([]);
      setMessage('Revenue settings saved.');
      toast.success(settings.enabled ? 'Revenue now shows on Overview.' : 'Revenue tracking is off.', { title: 'Revenue settings updated' });
    } catch (error) {
      const nextMessage = await readApiError(error, 'Revenue settings could not be saved.');
      setMessage(nextMessage);
      toast.error(nextMessage, { title: 'Revenue settings failed' });
    } finally {
      setSaving(false);
    }
  }

  if (!settings || !data) {
    return (
      <div className="mt-8 grid max-w-4xl gap-4">
        {message ? (
          <Notice tone="error">{message}</Notice>
        ) : (
          [0, 1, 2].map((key) => (
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

  const roleOf = (name: string): Role =>
    settings.successEvents.includes(name) ? 'success' : settings.failedEvents.includes(name) ? 'failed' : null;
  const setRole = (name: string, role: Role) => {
    const successEvents = settings.successEvents.filter((n) => n !== name);
    const failedEvents = settings.failedEvents.filter((n) => n !== name);
    if (role === 'success') successEvents.push(name);
    if (role === 'failed') failedEvents.push(name);
    setSettings({ ...settings, successEvents, failedEvents, enabled: successEvents.length === 0 ? false : settings.enabled });
  };
  const candidates: Candidate[] = [
    ...data.candidates,
    ...extraEvents.filter((name) => !data.candidates.some((c) => c.name === name)).map((name) => ({ name, count: 0, withAmount: 0, suggested: null }))
  ];
  const addEvent = () => {
    const name = newEvent.trim();
    if (!name || name.startsWith('$')) return;
    if (!candidates.some((c) => c.name === name)) setExtraEvents([...extraEvents, name]);
    setNewEvent('');
  };
  const prompt = buildRevenueSetupPrompt({
    projectId: data.project.id,
    currency: settings.currency,
    successEvent: settings.successEvents[0],
    failedEvent: settings.failedEvents[0]
  });
  const summary = data.summary;
  const attempts = summary ? summary.transactions + summary.failed : 0;

  return (
    <form onSubmit={save} className="mt-8 grid max-w-4xl gap-12">
      {!data.configured ? (
        <Notice tone="info">
          Revenue is off for {data.project.name}. Pick the events that mean a payment went through, and the ones that mean it failed,
          then turn it on. {settings.successEvents.length + settings.failedEvents.length > 0 ? 'We pre-selected events that look like payments; check them before saving.' : ''}
        </Notice>
      ) : null}

      <SettingsSection id="revenue" title="Revenue tracking" description="Only projects that turn this on get revenue on Overview and in the weekly digest.">
        <SettingsCard
          icon={Coins01Icon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Revenue
              <StatusPill tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'On' : 'Off'}</StatusPill>
            </span>
          }
          description="Sums the amount on your successful payment events and counts failed ones."
          actions={
            <Switch
              label="Enable revenue tracking"
              checked={settings.enabled}
              disabled={settings.successEvents.length === 0}
              onChange={(enabled) => setSettings({ ...settings, enabled })}
            />
          }
        >
          <SettingsRow label="Currency" hint="Shown on Overview. Send every amount in this currency.">
            <input
              aria-label="Currency"
              className={`${inputClass} max-w-[120px] font-mono uppercase`}
              maxLength={3}
              value={settings.currency}
              onChange={(e) => setSettings({ ...settings, currency: e.target.value.toUpperCase() })}
            />
          </SettingsRow>
          <SettingsRow label="Amount property" hint="The event property that holds the amount, in the main unit (naira, not kobo).">
            <input
              aria-label="Amount property"
              className={`${inputClass} max-w-[220px] font-mono text-xs`}
              value={settings.amountProperty}
              onChange={(e) => setSettings({ ...settings, amountProperty: e.target.value })}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        id="events"
        title="Payment events"
        description="Mark which events mean a payment succeeded and which mean it failed. Everything else is ignored."
      >
        <SettingsCard
          icon={CreditCardIcon}
          title="Events from the last 30 days"
          description={`${settings.successEvents.length} successful · ${settings.failedEvents.length} failed`}
        >
          {candidates.length > 0 ? (
            <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
              {candidates.map((candidate) => {
                const role = roleOf(candidate.name);
                return (
                  <li key={candidate.name} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <code className="truncate font-mono text-sm text-neutral-900 dark:text-white">{candidate.name}</code>
                        {candidate.suggested && role === null ? (
                          <StatusPill tone="neutral">Looks like a {candidate.suggested === 'success' ? 'payment' : 'failure'}</StatusPill>
                        ) : null}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-500 dark:text-slate-400">
                        {candidate.count.toLocaleString()} events
                        {candidate.withAmount > 0 ? ` · ${candidate.withAmount.toLocaleString()} with ${settings.amountProperty}` : ` · no ${settings.amountProperty}`}
                      </span>
                    </span>
                    <RoleToggle name={candidate.name} value={role} onChange={(next) => setRole(candidate.name, next)} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-4 text-sm text-neutral-500 dark:text-slate-400">
              No events in the last 30 days. Use the AI prompt below to add payment tracking, or add the event names you plan to send.
            </p>
          )}
          <div className="flex flex-col gap-2 border-t border-neutral-100 p-5 sm:flex-row dark:border-slate-800">
            <input
              aria-label="Event name"
              className={`${inputClass} font-mono text-xs`}
              placeholder="payment_succeeded"
              value={newEvent}
              onChange={(e) => setNewEvent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); addEvent(); }
              }}
            />
            <button type="button" className={secondaryButton} onClick={addEvent}>Add event</button>
          </div>
        </SettingsCard>
        {settings.successEvents.length > 0 && settings.successEvents.every((name) => (candidates.find((c) => c.name === name)?.withAmount ?? 0) === 0) ? (
          <Notice tone="warning">
            None of your successful payment events carried a numeric <code className="font-mono">{settings.amountProperty}</code> in the last 30 days, so revenue
            will read 0 and only payments will be counted.
          </Notice>
        ) : null}
      </SettingsSection>

      {summary ? (
        <SettingsSection id="check" title="Last 30 days" description="Computed with the saved settings, so you can check they match your payment provider.">
          <SettingsCard>
            <dl className="grid grid-cols-2 gap-px bg-neutral-100 sm:grid-cols-4 dark:bg-slate-800">
              <Stat label="Revenue" value={formatMoney(summary.total, data.settings.currency)} />
              <Stat label="Successful payments" value={summary.transactions.toLocaleString()} />
              <Stat label="Failed payments" value={summary.failed.toLocaleString()} />
              <Stat label="Success rate" value={attempts ? `${Math.round((summary.transactions / attempts) * 100)}%` : '–'} />
            </dl>
          </SettingsCard>
        </SettingsSection>
      ) : null}

      <SettingsSection
        id="ai"
        title="Set it up with AI"
        description="Paste this into Claude Code, Cursor or another coding assistant inside your app's repository."
      >
        <SettingsCard
          icon={AiMagicIcon}
          title="Revenue setup prompt"
          description="It sends successful and failed payments from your backend, where your payment provider confirms them."
          actions={<CopyButton value={prompt} label="Copy prompt" />}
          footer={
            <span>
              Want to do it by hand? Read the{' '}
              <Link className="font-medium underline underline-offset-2" href="/docs?page=revenue">
                revenue docs
              </Link>
              .
            </span>
          }
        >
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap px-5 py-4 font-mono text-xs leading-5 text-neutral-600 dark:text-slate-400">{prompt}</pre>
        </SettingsCard>
      </SettingsSection>

      <div className="sticky bottom-4 z-10 flex flex-col justify-between gap-3 rounded-xl border border-neutral-200 bg-white/95 px-5 py-3 shadow-[0_4px_16px_rgba(16,24,40,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:flex-row sm:items-center">
        <p className="text-sm text-neutral-500 dark:text-slate-400" role="status">
          {message || 'Changes apply to Overview as soon as they are saved, including past events.'}
        </p>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? 'Saving…' : 'Save revenue settings'}
        </button>
      </div>
    </form>
  );
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'success', label: 'Paid' },
  { value: 'failed', label: 'Failed' },
  { value: null, label: 'Ignore' }
];

function RoleToggle({ name, value, onChange }: { name: string; value: Role; onChange: (value: Role) => void }) {
  return (
    <div role="radiogroup" aria-label={`What ${name} means`} className="inline-flex shrink-0 rounded-lg border border-neutral-200 p-0.5 dark:border-slate-700">
      {ROLES.map((role) => {
        const selected = value === role.value;
        return (
          <button
            key={role.label}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(role.value)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition ${
              selected
                ? role.value === 'success'
                  ? 'bg-emerald-600 text-white'
                  : role.value === 'failed'
                    ? 'bg-red-600 text-white'
                    : 'bg-neutral-900 text-white dark:bg-white dark:text-slate-950'
                : 'text-neutral-600 hover:bg-neutral-100 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            {role.label}
          </button>
        );
      })}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-5 py-4 dark:bg-slate-900">
      <dt className="text-xs text-neutral-500 dark:text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-neutral-900 dark:text-white">{value}</dd>
    </div>
  );
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
  } catch {
    return `${value.toLocaleString()} ${currency}`;
  }
}
