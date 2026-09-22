'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';
import { DashboardDialog } from '../../DashboardDialog';
import { toast } from '@/lib/toast';

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
  if (!settings) return <p className="py-8 text-sm text-neutral-500">{message || 'Loading replay settingsâ€¦'}</p>;
  const activeProjectId = data?.project.id ?? projectId;
  return (
    <form onSubmit={save} className="mt-6 grid max-w-4xl gap-5">
      {!data?.entitlement.available ? <div className="rounded-md border border-neutral-300 p-4 text-sm text-neutral-700 dark:border-slate-700 dark:text-slate-300">
        {data?.entitlement.plan === 'pro' ? 'Session Replay is temporarily unavailable for this organization. Contact TraceIQ support.' : <>Session Replay is available on Pro. <Link className="font-semibold text-blue-600 hover:underline" href={`/dashboard/settings/billing${activeProjectId ? `?projectId=${encodeURIComponent(activeProjectId)}` : ''}`}>View upgrade options</Link>.</>}
      </div> : null}
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <Toggle label="Session Replay" description="Off by default. rrweb is not loaded until a selected flow begins." checked={settings.enabled} disabled={!data?.entitlement.available || settings.selectedFunnelIds.length === 0} onChange={enabled => setSettings({ ...settings, enabled })} />
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <NumberField label="Sample rate (%)" min={0} max={100} value={settings.sampleRate * 100} onChange={value => setSettings({ ...settings, sampleRate: value / 100 })} />
          <NumberField label="Maximum duration (seconds)" min={1} max={14400} value={settings.maxDurationSeconds} onChange={value => setSettings({ ...settings, maxDurationSeconds: value })} />
          <NumberField label="Retention (days)" min={1} max={3650} value={settings.retentionDays} onChange={value => setSettings({ ...settings, retentionDays: value })} />
        </div>
      </section>
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="font-semibold">Flows to record</h2>
        <p className="mt-1 text-sm text-neutral-500">Choose the product journeys Session Replay may capture. Recording starts when an accepted event matches the current first step of a selected funnel.</p>
        {(data?.funnels.length ?? 0) === 0 ? (
          <p className="mt-4 rounded-md border border-neutral-200 p-4 text-sm text-neutral-600 dark:border-slate-800 dark:text-slate-400">
            No funnels exist for this project. <Link className="font-semibold text-blue-600 hover:underline" href={`/dashboard/funnels${activeProjectId ? `?projectId=${encodeURIComponent(activeProjectId)}` : ''}`}>Create a funnel</Link> before enabling Replay.
          </p>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {data?.funnels.map((funnel) => <label key={funnel.id} className="flex cursor-pointer items-start gap-3 rounded-md border border-neutral-200 p-3 dark:border-slate-800"><input type="checkbox" className="mt-0.5 size-4" checked={settings.selectedFunnelIds.includes(funnel.id)} disabled={!data.entitlement.available} onChange={event => {
              const selectedFunnelIds = event.target.checked ? [...settings.selectedFunnelIds, funnel.id] : settings.selectedFunnelIds.filter(id => id !== funnel.id);
              setSettings({ ...settings, selectedFunnelIds, enabled: selectedFunnelIds.length === 0 ? false : settings.enabled });
            }} /><span><span className="block text-sm font-medium">{funnel.name}</span><span className="mt-0.5 block font-mono text-xs text-neutral-500">Starts with {funnel.triggerEventName}</span></span></label>)}
          </div>
        )}
        {settings.selectedFunnelIds.length === 0 ? <p className="mt-3 text-sm text-amber-700 dark:text-amber-300">Select at least one flow before recording can begin. Zero selected flows never means record everything.</p> : null}
      </section>
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="font-semibold">Privacy mode</h2><p className="mt-1 text-sm text-neutral-500">All modes mask every form input and permanently block known credential and payment surfaces before events leave the page.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(['strict', 'balanced', 'custom'] as PrivacyMode[]).map(mode => <label key={mode} className={`rounded-md border p-4 ${settings.privacyMode === mode ? 'border-blue-500 dark:bg-blue-950/20' : 'border-neutral-200 dark:border-slate-800'}`}><input type="radio" name="privacy" className="mr-2" checked={settings.privacyMode === mode} onChange={() => setSettings({ ...settings, privacyMode: mode })} /><span className="font-semibold capitalize">{mode}</span><p className="mt-2 text-xs leading-5 text-neutral-500">{mode === 'strict' ? 'Masks inputs and all visible text.' : mode === 'balanced' ? 'Masks all inputs; records ordinary visible text.' : 'Uses customer selectors in addition to permanent safety rules.'}</p></label>)}
        </div>
        {settings.privacyMode === 'custom' ? <div className="mt-4 grid gap-3"><SelectorField label="Additional mask selectors" value={settings.maskSelectors} onChange={maskSelectors => setSettings({ ...settings, maskSelectors })} /><SelectorField label="Additional block selectors" value={settings.blockSelectors} onChange={blockSelectors => setSettings({ ...settings, blockSelectors })} /><SelectorField label="Additional ignore selectors" value={settings.ignoreSelectors} onChange={ignoreSelectors => setSettings({ ...settings, ignoreSelectors })} /></div> : null}
      </section>
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <Toggle label="Require replay consent" description="The recorder will not be imported or started until grantReplayConsent() is called. Your CMP remains the source of truth." checked={settings.requireConsent} onChange={requireConsent => setSettings({ ...settings, requireConsent })} />
        <p className="mt-4 text-xs leading-5 text-neutral-500">Masking is a risk-control, not a guarantee of GDPR, CCPA, or other legal compliance. Already uploaded chunks remain until retention or an authorized deletion request; revocation stops capture immediately and discards unsent events.</p>
      </section>
      {message ? <p className="text-sm">{message}</p> : null}
      <button type="submit" disabled={saving} className="w-fit rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{saving ? 'Savingâ€¦' : 'Save replay settings'}</button>
      <DashboardDialog
        open={privacyDialogOpen}
        title="Confirm replay privacy changes"
        description="This configuration weakens TraceIQ privacy defaults. Confirm that your masking rules, privacy notice, and consent basis have been reviewed."
        onClose={() => {
          if (!saving) setPrivacyDialogOpen(false);
        }}
        footer={
          <>
            <button
              type="button"
              className="h-10 rounded-md border border-neutral-300 bg-white px-4 text-sm font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              disabled={saving}
              onClick={() => setPrivacyDialogOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="h-10 rounded-md bg-amber-600 px-4 text-sm font-bold text-white transition hover:bg-amber-700 disabled:cursor-wait disabled:opacity-60"
              disabled={saving}
              onClick={() => void persistSettings(true)}
            >
              {saving ? 'Saving…' : 'Confirm and save'}
            </button>
          </>
        }
      >
        {privacyError ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300" role="alert">
            {privacyError}
          </p>
        ) : (
          <p className="text-sm leading-6 text-neutral-600 dark:text-slate-400">
            Custom masking and consent settings affect what may be recorded. Verify this configuration before enabling it for users.
          </p>
        )}
      </DashboardDialog>
    </form>
  );
}

function Toggle({ label, description, checked, onChange, disabled = false }: { label: string; description: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <label className="flex items-start justify-between gap-6"><span><span className="font-semibold">{label}</span><span className="mt-1 block text-sm text-neutral-500">{description}</span></span><input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} className="mt-1 size-5" /></label> }
function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) { return <label className="grid gap-1.5 text-xs font-semibold">{label}<input className="h-10 rounded-md border border-neutral-300 bg-transparent px-3 text-sm" type="number" value={value} min={min} max={max} onChange={e => onChange(Number(e.target.value))} /></label> }
function SelectorField({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) { return <label className="grid gap-1.5 text-xs font-semibold">{label}<input className="h-10 rounded-md border border-neutral-300 bg-transparent px-3 font-mono text-xs" value={value.join(', ')} onChange={e => onChange(e.target.value.split(',').map(x => x.trim()).filter(Boolean))} placeholder=".customer-secret, [data-private]" /></label> }
