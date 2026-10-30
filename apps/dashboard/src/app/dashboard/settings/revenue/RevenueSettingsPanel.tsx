'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { DEFAULT_FAILED_EVENT, DEFAULT_SUCCESS_EVENT, buildRevenueSetupPrompt } from '@/lib/revenue-setup-prompt';
import Coins01Icon from '@hugeicons/core-free-icons/Coins01Icon';
import CheckmarkCircle02Icon from '@hugeicons/core-free-icons/CheckmarkCircle02Icon';
import CancelCircleIcon from '@hugeicons/core-free-icons/CancelCircleIcon';
import Search01Icon from '@hugeicons/core-free-icons/Search01Icon';
import Cancel01Icon from '@hugeicons/core-free-icons/Cancel01Icon';
import Add01Icon from '@hugeicons/core-free-icons/Add01Icon';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
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
  primaryButton
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
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { void load(); }, [projectId]);

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }

  function apply(body: Response) {
    setData(body);
    if (body.configured) return setSettings(body.settings);
    // First visit: use events that already look like payments, or the names we recommend
    // sending, so a new project only has to send them and switch revenue on.
    const suggested = (role: Role) => body.candidates.filter((c) => c.suggested === role).map((c) => c.name);
    const successEvents = suggested('success');
    const failedEvents = suggested('failed');
    setSettings({
      ...body.settings,
      successEvents: successEvents.length ? successEvents : [DEFAULT_SUCCESS_EVENT],
      failedEvents: failedEvents.length ? failedEvents : [DEFAULT_FAILED_EVENT]
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

  const candidates = data.candidates;
  const setSuccessEvents = (successEvents: string[]) =>
    setSettings({ ...settings, successEvents, enabled: successEvents.length === 0 ? false : settings.enabled });
  const setFailedEvents = (failedEvents: string[]) => setSettings({ ...settings, failedEvents });
  const successSuggestions = candidates.filter((c) => c.suggested === 'success' || (isPaymentEvent(c.name) && !FAILED_NAME.test(c.name) && !INTENT_NAME.test(c.name)));
  const failedSuggestions = candidates.filter((c) => c.suggested === 'failed' || (isPaymentEvent(c.name) && FAILED_NAME.test(c.name)));
  const successEvent = settings.successEvents[0] ?? DEFAULT_SUCCESS_EVENT;
  const failedEvent = settings.failedEvents[0] ?? DEFAULT_FAILED_EVENT;
  const prompt = buildRevenueSetupPrompt({ projectId: data.project.id, currency: settings.currency, successEvent, failedEvent });
  const usesOwnNames =
    successSuggestions.length + failedSuggestions.length > 0 ||
    settings.successEvents.some((name) => name !== DEFAULT_SUCCESS_EVENT) ||
    settings.failedEvents.some((name) => name !== DEFAULT_FAILED_EVENT);
  const received = (name: string) => candidates.find((c) => c.name === name)?.count ?? 0;
  const summary = data.summary;
  const attempts = summary ? summary.transactions + summary.failed : 0;
  const example = `traceiq.capture({
  event: '${successEvent}',
  userId: user.id,
  properties: { amount: 5000, currency: '${settings.currency}', reference: 'T123' }
});`;

  return (
    <form onSubmit={save} className="mt-8 grid max-w-4xl gap-12">
      <SettingsSection
        id="send"
        title="1. Send payment events from your app"
        description="Revenue comes from two events your app sends: one when a payment goes through, and one when it fails. Send them from your backend, when your payment provider (Paystack, Flutterwave, Stripe…) confirms the payment."
      >
        <SettingsCard
          icon={AiMagicIcon}
          title="Events TraceIQ is waiting for"
          description="Copy the prompt into Claude Code, Cursor or another coding assistant in your app's repository. It adds both events for you."
          actions={<CopyButton value={prompt} label="Copy AI prompt" />}
          footer={
            <span>
              Prefer to write it yourself? The{' '}
              <Link className="font-medium underline underline-offset-2" href="/docs?page=revenue">
                revenue docs
              </Link>{' '}
              have a full Paystack webhook example.
            </span>
          }
        >
          <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
            <EventStatus
              icon={CheckmarkCircle02Icon}
              names={settings.successEvents.length ? settings.successEvents : [successEvent]}
              meaning="A payment went through. Its amount is added to revenue."
              properties={`${settings.amountProperty}, currency, reference`}
              received={received}
            />
            <EventStatus
              icon={CancelCircleIcon}
              names={settings.failedEvents.length ? settings.failedEvents : [failedEvent]}
              meaning="A payment failed. Counted, but nothing is added. Optional."
              properties="reason, plus the same as above"
              received={received}
            />
          </ul>
          <div className="border-t border-neutral-100 px-5 py-4 dark:border-slate-800">
            <p className="text-xs font-medium text-neutral-500 dark:text-slate-400">What the code looks like (Node.js)</p>
            <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-50 p-3 font-mono text-xs leading-5 text-neutral-700 dark:bg-slate-950 dark:text-slate-300">{example}</pre>
            <p className="mt-2 text-xs text-neutral-500 dark:text-slate-400">
              Send <code className="font-mono">{settings.amountProperty}</code> in the main currency unit: naira, not kobo. Paystack and Stripe give you the smallest unit, so divide by 100.
            </p>
          </div>
        </SettingsCard>

        <details
          open={usesOwnNames || undefined}
          className="group rounded-xl border border-neutral-200 bg-white dark:border-slate-800 dark:bg-slate-900/40"
        >
          <summary className="cursor-pointer list-none px-5 py-4 text-sm font-medium text-neutral-900 dark:text-white">
            <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
            Already sending payments under other names?
            <span className="mt-0.5 block pl-4 text-sm font-normal text-neutral-500 dark:text-slate-400">
              Use your existing events instead, like subscription_purchased or order_paid.
            </span>
          </summary>
          <div className="grid gap-6 border-t border-neutral-100 p-5 dark:border-slate-800">
            <EventPicker
              title="Payment went through"
              label="Payment succeeded events"
              selected={settings.successEvents}
              onChange={setSuccessEvents}
              candidates={candidates}
              suggestions={successSuggestions}
              taken={settings.failedEvents}
              amountProperty={settings.amountProperty}
              placeholder={DEFAULT_SUCCESS_EVENT}
            />
            <EventPicker
              title="Payment failed"
              label="Payment failed events"
              selected={settings.failedEvents}
              onChange={setFailedEvents}
              candidates={candidates}
              suggestions={failedSuggestions}
              taken={settings.successEvents}
              amountProperty={settings.amountProperty}
              placeholder={DEFAULT_FAILED_EVENT}
            />
            <label className="grid gap-1.5 text-sm font-medium text-neutral-700 dark:text-slate-300">
              Amount property
              <input
                aria-label="Amount property"
                className={`${inputClass} max-w-[220px] font-mono text-xs`}
                value={settings.amountProperty}
                onChange={(e) => setSettings({ ...settings, amountProperty: e.target.value })}
              />
              <span className="text-xs font-normal text-neutral-500 dark:text-slate-400">The event property that holds the amount.</span>
            </label>
          </div>
        </details>
      </SettingsSection>

      <SettingsSection id="revenue" title="2. Turn on revenue" description="Adds a Revenue card to Overview and revenue to the weekly digest.">
        <SettingsCard
          icon={Coins01Icon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Revenue
              <StatusPill tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'On' : 'Off'}</StatusPill>
            </span>
          }
          description={
            received(successEvent) === 0 && settings.successEvents.every((name) => received(name) === 0)
              ? 'You can turn it on now. Revenue reads 0 until the first payment event arrives.'
              : 'Sums the amount on your successful payments and counts failed ones.'
          }
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
          {summary ? (
            <dl className="grid grid-cols-2 gap-px border-t border-neutral-100 bg-neutral-100 sm:grid-cols-4 dark:border-slate-800 dark:bg-slate-800">
              <Stat label="Revenue, 30 days" value={formatMoney(summary.total, data.settings.currency)} />
              <Stat label="Successful payments" value={summary.transactions.toLocaleString()} />
              <Stat label="Failed payments" value={summary.failed.toLocaleString()} />
              <Stat label="Success rate" value={attempts ? `${Math.round((summary.transactions / attempts) * 100)}%` : '–'} />
            </dl>
          ) : null}
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

function EventStatus({
  icon,
  names,
  meaning,
  properties,
  received
}: {
  icon: IconSvgElement;
  names: string[];
  meaning: string;
  properties: string;
  received: (name: string) => number;
}) {
  const total = names.reduce((sum, name) => sum + received(name), 0);
  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <span className="flex min-w-0 gap-3">
        <HugeiconsIcon icon={icon} size={18} strokeWidth={1.8} className="mt-0.5 shrink-0 text-neutral-500 dark:text-slate-400" />
        <span className="min-w-0">
          <code className="block truncate font-mono text-sm font-medium text-neutral-900 dark:text-white">{names.join(', ')}</code>
          <span className="mt-0.5 block text-sm text-neutral-600 dark:text-slate-300">{meaning}</span>
          <span className="mt-0.5 block text-xs text-neutral-500 dark:text-slate-400">Properties: {properties}</span>
        </span>
      </span>
      <StatusPill tone={total > 0 ? 'success' : 'warning'}>
        {total > 0 ? `${total.toLocaleString()} received in 30 days` : 'Not received yet'}
      </StatusPill>
    </li>
  );
}

// Name hints for suggesting payment events; the user always confirms the choice.
const PAYMENT_NAME = /(^|_)(payments?|paid|pay|charges?|charged|purchases?|purchased|subscriptions?|subscribed|orders?|checkout|transfers?|payouts?|deposits?|invoices?|renewals?|renewed|revenue|sales?|billing)($|_)/i;
const FAILED_NAME = /(^|_)(failed|failure|declined|error)($|_)/i;
const INTENT_NAME = /(^|_)(start|started|initiated|redirected|viewed|opened|clicked|selected|shown|dismissed|added|attempted|abandoned|cancelled|canceled|pending|returned)($|_)/i;
const MAX_OPTIONS = 8;

function isPaymentEvent(name: string) {
  return PAYMENT_NAME.test(name);
}

/** Selected events as removable chips, plus a search box over the project's recent events. */
function EventPicker({
  title,
  label,
  selected,
  onChange,
  candidates,
  suggestions,
  taken,
  amountProperty,
  placeholder
}: {
  title: string;
  label: string;
  selected: string[];
  onChange: (events: string[]) => void;
  candidates: Candidate[];
  suggestions: Candidate[];
  taken: string[];
  amountProperty: string;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const search = query.trim();
  const available = (c: Candidate) => !selected.includes(c.name) && !taken.includes(c.name);
  const options = (search
    ? candidates.filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
    : suggestions
  ).filter(available).slice(0, MAX_OPTIONS);
  const canUseTyped = Boolean(search) && !search.startsWith('$') && !/\s/.test(search)
    && !candidates.some((c) => c.name === search) && !selected.includes(search) && !taken.includes(search);
  const quickPicks = suggestions.filter(available).slice(0, 3);
  const info = (name: string) => candidates.find((c) => c.name === name);

  const add = (name: string) => {
    onChange([...selected, name]);
    setQuery('');
  };

  return (
    <div className="grid gap-2.5">
      <p className="text-sm font-medium text-neutral-900 dark:text-white">{title}</p>
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={label}>
          {selected.map((name) => {
            const event = info(name);
            return (
              <li key={name} className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 py-1 pl-3 pr-1 dark:border-slate-700 dark:bg-slate-800/60">
                <span className="min-w-0">
                  <code className="block truncate font-mono text-xs font-medium text-neutral-900 dark:text-white">{name}</code>
                  <span className="block text-[11px] text-neutral-500 dark:text-slate-400">{describe(event, amountProperty)}</span>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${name}`}
                  onClick={() => onChange(selected.filter((n) => n !== name))}
                  className="grid h-6 w-6 place-items-center rounded-md text-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="relative">
        <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.8} className="pointer-events-none absolute left-3 top-[18px] -translate-y-1/2 text-neutral-400" />
        <input
          role="combobox"
          aria-label={`Search events for ${label.toLowerCase()}`}
          aria-expanded={open}
          className={`${inputClass} pl-9 font-mono text-xs`}
          placeholder={selected.length ? 'Add another event…' : `Search your events, or type one like ${placeholder}`}
          value={query}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (options[0]) add(options[0].name);
              else if (canUseTyped) add(search);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        {open && (options.length > 0 || canUseTyped || !search) ? (
          <ul
            role="listbox"
            className="mt-1 max-h-72 w-full overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {!search ? (
              <li className="px-3 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-slate-500">
                {options.length ? 'Looks like a payment' : 'Type to search all your events'}
              </li>
            ) : null}
            {options.map((c) => (
              <li key={c.name} role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); add(c.name); }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-slate-800"
                >
                  <code className="truncate font-mono text-xs text-neutral-900 dark:text-white">{c.name}</code>
                  <span className="shrink-0 text-[11px] text-neutral-500 dark:text-slate-400">{describe(c, amountProperty)}</span>
                </button>
              </li>
            ))}
            {canUseTyped ? (
              <li role="option" aria-selected={false}>
                <button
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); add(search); }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
                  Use <code className="font-mono">{search}</code>
                  <span className="text-neutral-400">· not received yet</span>
                </button>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>

      {selected.length === 0 && quickPicks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500 dark:text-slate-400">
          Suggested:
          {quickPicks.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => add(c.name)}
              className="inline-flex items-center gap-1 rounded-md border border-dashed border-neutral-300 px-2 py-1 font-mono text-neutral-700 hover:border-neutral-500 hover:text-neutral-950 dark:border-slate-600 dark:text-slate-300 dark:hover:text-white"
            >
              <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function describe(event: Candidate | undefined, amountProperty: string) {
  if (!event || event.count === 0) return 'No events in the last 30 days';
  const count = `${event.count.toLocaleString()} in 30 days`;
  return event.withAmount > 0 ? `${count} · has ${amountProperty}` : `${count} · no ${amountProperty}`;
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
