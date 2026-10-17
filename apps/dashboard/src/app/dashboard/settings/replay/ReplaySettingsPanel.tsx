'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { DashboardDialog } from '../../DashboardDialog';
import { toast } from '@/lib/toast';
import { Checkbox } from '@traceiq/ui';
import Route01Icon from '@hugeicons/core-free-icons/Route01Icon';
import Shield01Icon from '@hugeicons/core-free-icons/Shield01Icon';
import UserCheck01Icon from '@hugeicons/core-free-icons/UserCheck01Icon';
import VideoReplayIcon from '@hugeicons/core-free-icons/VideoReplayIcon';
import { Skeleton } from '@/components/Skeleton';
import {
  Notice,
  SettingsCard,
  SettingsRow,
  SettingsSection,
  StatusPill,
  Switch,
  fieldLabelClass,
  inputClass,
  primaryButton,
  secondaryButton
} from '../SettingsUI';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type PrivacyMode = 'strict' | 'balanced' | 'custom';
interface Settings { enabled: boolean; sampleRate: number; maxDurationSeconds: number; retentionDays: number; privacyMode: PrivacyMode; requireConsent: boolean; maskSelectors: string[]; blockSelectors: string[]; ignoreSelectors: string[]; selectedFunnelIds: string[]; }
interface ReplayFunnel { id: string; name: string; triggerEventName: string; }
interface Response { settings: Settings; funnels: ReplayFunnel[]; entitlement: { available: boolean; plan: string; limits: Record<string, number | null> }; project: { id: string }; }

export function ReplaySettingsPanel({ projectId }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<Response>();
  const [settings, setSettings] = useState<Settings>();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [privacyDialogOpen, setPrivacyDialogOpen] = useState(false);
  const [privacyError, setPrivacyError] = useState('');
  useEffect(() => { void load(); }, [projectId]);

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }
  async function load() {
    const access = await token(); if (!access) return setMessage('Your dashboard session expired.');
    const response = await fetch(`${apiBaseUrl}/v1/dashboard/replays/settings${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { headers: { Authorization: `Bearer ${access}` } });
    if (!response.ok) return setMessage(await readApiError(response));
    const body = await response.json() as Response; setData(body); setSettings(body.settings);
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    if (settings.privacyMode === 'custom' || !settings.requireConsent) {
      setPrivacyError('');
      setPrivacyDialogOpen(true);
      return;
    }
    await persistSettings(false);
  }

  async function persistSettings(fromPrivacyDialog: boolean) {
    if (!settings || saving) return;
    setSaving(true);
    setMessage('');
    setPrivacyError('');
    try {
      const access = await token();
      if (!access) throw new Error('Your dashboard session expired. Sign in again.');
      const response = await fetch(`${apiBaseUrl}/v1/dashboard/replays/settings`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${access}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          projectId: data?.project.id ?? projectId,
          acknowledgePrivacyRisk: settings.privacyMode === 'custom' || !settings.requireConsent
        })
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const body = await response.json() as { settings: Settings };
      setSettings(body.settings);
      setMessage('Replay settings saved.');
      if (fromPrivacyDialog) setPrivacyDialogOpen(false);
      toast.success('Replay settings were saved.', { title: 'Replay settings updated' });
    } catch (error) {
      const nextMessage = await readApiError(error, 'Replay settings could not be saved.');
      setMessage(nextMessage);
      if (fromPrivacyDialog) setPrivacyError(nextMessage);
      toast.error(nextMessage, { title: 'Replay settings failed' });
    } finally {
      setSaving(false);
    }
  }
  if (!settings) {
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

  const activeProjectId = data?.project.id ?? projectId;
  const projectQuery = activeProjectId ? `?projectId=${encodeURIComponent(activeProjectId)}` : '';
  const available = Boolean(data?.entitlement.available);
  const funnels = data?.funnels ?? [];

  return (
    <form onSubmit={save} className="mt-8 grid max-w-4xl gap-12">
      {!available ? (
        <Notice tone="warning">
          {data?.entitlement.plan === 'pro' ? (
            'Session Replay is temporarily unavailable for this organization. Contact TraceIQ support.'
          ) : (
            <>
              Session Replay is available on Pro.{' '}
              <Link className="font-medium underline underline-offset-2" href={`/dashboard/settings/billing${projectQuery}`}>
                View upgrade options
              </Link>
            </>
          )}
        </Notice>
      ) : null}

      <SettingsSection id="recording" title="Recording" description="Turn Session Replay on and control how much is captured.">
        <SettingsCard
          icon={VideoReplayIcon}
          title={
            <span className="flex flex-wrap items-center gap-2">
              Session Replay
              <StatusPill tone={settings.enabled ? 'success' : 'neutral'}>{settings.enabled ? 'On' : 'Off'}</StatusPill>
            </span>
          }
          description="Off by default. rrweb is not loaded until a selected flow begins."
          actions={
            <Switch
              label="Enable Session Replay"
              checked={settings.enabled}
              disabled={!available || settings.selectedFunnelIds.length === 0}
              onChange={(enabled) => setSettings({ ...settings, enabled })}
            />
          }
        >
          <SettingsRow label="Sample rate" hint="Share of matching sessions to record.">
            <NumberField
              id="replay-sample-rate"
              unit="%"
              min={0}
              max={100}
              value={settings.sampleRate * 100}
              onChange={(value) => setSettings({ ...settings, sampleRate: value / 100 })}
            />
          </SettingsRow>
          <SettingsRow label="Maximum duration" hint="Recording stops after this long.">
            <NumberField
              id="replay-max-duration"
              unit="seconds"
              min={1}
              max={14400}
              value={settings.maxDurationSeconds}
              onChange={(value) => setSettings({ ...settings, maxDurationSeconds: value })}
            />
          </SettingsRow>
          <SettingsRow label="Retention" hint="How long recordings are kept.">
            <NumberField
              id="replay-retention"
              unit="days"
              min={1}
              max={3650}
              value={settings.retentionDays}
              onChange={(value) => setSettings({ ...settings, retentionDays: value })}
            />
          </SettingsRow>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection
        id="flows"
        title="Flows to record"
        description="Recording starts when an accepted event matches the current first step of a selected funnel."
      >
        <SettingsCard
          icon={Route01Icon}
          title="Funnels"
          description={
            funnels.length === 0
              ? 'No funnels exist for this project yet.'
              : `${settings.selectedFunnelIds.length} of ${funnels.length} selected`
          }
          actions={
            funnels.length === 0 ? (
              <Link className={primaryButton} href={`/dashboard/funnels${projectQuery}`}>
                Create a funnel
              </Link>
            ) : null
          }
        >
          {funnels.length > 0 ? (
            <ul className="divide-y divide-neutral-100 dark:divide-slate-800">
              {funnels.map((funnel) => {
                const checked = settings.selectedFunnelIds.includes(funnel.id);
                return (
                  <li key={funnel.id}>
                    <label
                      className={`flex items-center gap-3 px-5 py-3.5 transition ${
                        available ? 'cursor-pointer hover:bg-neutral-50 dark:hover:bg-slate-900/60' : 'cursor-not-allowed opacity-60'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={!available}
                        aria-label={funnel.name}
                        onCheckedChange={(value) => {
                          const selectedFunnelIds = value === true
                            ? [...settings.selectedFunnelIds, funnel.id]
                            : settings.selectedFunnelIds.filter((id) => id !== funnel.id);
                          setSettings({ ...settings, selectedFunnelIds, enabled: selectedFunnelIds.length === 0 ? false : settings.enabled });
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-neutral-900 dark:text-white">{funnel.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-neutral-500 dark:text-slate-400">
                          Starts with <code className="font-mono">{funnel.triggerEventName}</code>
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </SettingsCard>
        {settings.selectedFunnelIds.length === 0 ? (
          <Notice tone="warning">Select at least one flow before recording can begin. Zero selected flows never means record everything.</Notice>
        ) : null}
      </SettingsSection>

      <SettingsSection
        id="privacy"
        title="Privacy"
        description="Every mode masks all form inputs and permanently blocks known credential and payment surfaces before events leave the page."
      >
        <SettingsCard icon={Shield01Icon} title="Privacy mode" description="Choose how much visible page content is recorded.">
          <div className="grid gap-3 p-5 sm:grid-cols-3" role="radiogroup" aria-label="Privacy mode">
            {PRIVACY_MODES.map((mode) => {
              const selected = settings.privacyMode === mode.id;
              return (
                <label
                  key={mode.id}
                  className={`relative flex cursor-pointer flex-col rounded-lg border p-4 transition ${
                    selected
                      ? 'border-neutral-900 ring-1 ring-neutral-900 dark:border-slate-300 dark:ring-slate-300'
                      : 'border-neutral-200 hover:border-neutral-300 dark:border-slate-800 dark:hover:border-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="privacy"
                    className="sr-only"
                    checked={selected}
                    onChange={() => setSettings({ ...settings, privacyMode: mode.id })}
                  />
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-neutral-900 dark:text-white">{mode.label}</span>
                    <span
                      aria-hidden="true"
                      className={`grid h-4 w-4 place-items-center rounded-full border ${
                        selected ? 'border-neutral-900 dark:border-slate-200' : 'border-neutral-300 dark:border-slate-600'
                      }`}
                    >
                      {selected ? <span className="h-2 w-2 rounded-full bg-neutral-900 dark:bg-slate-200" /> : null}
                    </span>
                  </span>
                  <span className="mt-1.5 text-xs leading-5 text-neutral-500 dark:text-slate-400">{mode.description}</span>
                </label>
              );
            })}
          </div>
          {settings.privacyMode === 'custom' ? (
            <div className="grid gap-4 border-t border-neutral-100 p-5 dark:border-slate-800">
              <SelectorField id="replay-mask" label="Additional mask selectors" hint="Text inside these elements is replaced with asterisks." value={settings.maskSelectors} onChange={(maskSelectors) => setSettings({ ...settings, maskSelectors })} />
              <SelectorField id="replay-block" label="Additional block selectors" hint="These elements are replaced with an empty placeholder." value={settings.blockSelectors} onChange={(blockSelectors) => setSettings({ ...settings, blockSelectors })} />
              <SelectorField id="replay-ignore" label="Additional ignore selectors" hint="Interactions with these elements are not recorded." value={settings.ignoreSelectors} onChange={(ignoreSelectors) => setSettings({ ...settings, ignoreSelectors })} />
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard
          icon={UserCheck01Icon}
          title="Require replay consent"
          description={
            <>
              The recorder is not imported or started until <code className="font-mono text-xs">grantReplayConsent()</code> is called. Your CMP remains the source of truth.
            </>
          }
          actions={
            <Switch
              label="Require replay consent"
              checked={settings.requireConsent}
              onChange={(requireConsent) => setSettings({ ...settings, requireConsent })}
            />
          }
          footer={
            <span className="leading-5">
              Masking is a risk control, not a guarantee of GDPR, CCPA, or other legal compliance. Already uploaded chunks remain until retention or an authorized deletion request; revocation stops capture immediately and discards unsent events.
            </span>
          }
        />
      </SettingsSection>

      <div className="sticky bottom-4 z-10 flex flex-col justify-between gap-3 rounded-xl border border-neutral-200 bg-white/95 px-5 py-3 shadow-[0_4px_16px_rgba(16,24,40,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:flex-row sm:items-center">
        <p className="text-sm text-neutral-500 dark:text-slate-400" role="status">
          {message || 'Changes apply to new recordings once saved.'}
        </p>
        <button type="submit" disabled={saving} className={primaryButton}>
          {saving ? 'Saving…' : 'Save replay settings'}
        </button>
      </div>

      <DashboardDialog
        open={privacyDialogOpen}
        title="Confirm replay privacy changes"
        description="This configuration weakens TraceIQ privacy defaults. Confirm that your masking rules, privacy notice, and consent basis have been reviewed."
        onClose={() => {
          if (!saving) setPrivacyDialogOpen(false);
        }}
        footer={
          <>
            <button type="button" className={secondaryButton} disabled={saving} onClick={() => setPrivacyDialogOpen(false)}>
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-lg bg-amber-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              onClick={() => void persistSettings(true)}
            >
              {saving ? 'Saving…' : 'Confirm and save'}
            </button>
          </>
        }
      >
        {privacyError ? (
          <Notice tone="error">{privacyError}</Notice>
        ) : (
          <p className="text-sm leading-6 text-neutral-600 dark:text-slate-400">
            Custom masking and consent settings affect what may be recorded. Verify this configuration before enabling it for users.
          </p>
        )}
      </DashboardDialog>
    </form>
  );
}

const PRIVACY_MODES: { id: PrivacyMode; label: string; description: string }[] = [
  { id: 'strict', label: 'Strict', description: 'Masks inputs and all visible text.' },
  { id: 'balanced', label: 'Balanced', description: 'Masks all inputs; records ordinary visible text.' },
  { id: 'custom', label: 'Custom', description: 'Uses your selectors in addition to the permanent safety rules.' }
];

function NumberField({ id, unit, value, min, max, onChange }: { id: string; unit: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  return (
    <div className="flex max-w-[220px] items-center gap-2">
      <input
        id={id}
        className={`${inputClass} tabular-nums`}
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="shrink-0 text-sm text-neutral-500 dark:text-slate-400">{unit}</span>
    </div>
  );
}

function SelectorField({ id, label, hint, value, onChange }: { id: string; label: string; hint: string; value: string[]; onChange: (value: string[]) => void }) {
  // Keep the raw text locally so typing a comma or space is not swallowed by the parse.
  const [draft, setDraft] = useState(value.join(', '));
  return (
    <label className={fieldLabelClass} htmlFor={id}>
      {label}
      <input
        id={id}
        className={`${inputClass} font-mono text-xs`}
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          onChange(e.target.value.split(',').map((x) => x.trim()).filter(Boolean));
        }}
        placeholder=".customer-secret, [data-private]"
      />
      <span className="text-xs font-normal text-neutral-500 dark:text-slate-400">{hint} Separate with commas.</span>
    </label>
  );
}
