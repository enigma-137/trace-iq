'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readApiError } from '@/lib/api-error';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
type PrivacyMode = 'strict' | 'balanced' | 'custom';
interface Settings { enabled:boolean; sampleRate:number; maxDurationSeconds:number; retentionDays:number; privacyMode:PrivacyMode; requireConsent:boolean; maskSelectors:string[]; blockSelectors:string[]; ignoreSelectors:string[]; }
interface Response { settings: Settings; entitlement: { available:boolean; limits: Record<string, number|null> }; project:{id:string}; }

export function ReplaySettingsPanel({ projectId }: { projectId?: string }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [data, setData] = useState<Response>();
  const [settings, setSettings] = useState<Settings>();
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { void load(); }, [projectId]);

  async function token() { return (await supabase.auth.getSession()).data.session?.access_token; }
  async function load() {
    const access = await token(); if (!access) return setMessage('Your dashboard session expired.');
    const response = await fetch(`${apiBaseUrl}/v1/dashboard/replays/settings${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, { headers:{Authorization:`Bearer ${access}`} });
    if (!response.ok) return setMessage(await readApiError(response));
    const body = await response.json() as Response; setData(body); setSettings(body.settings);
  }
  async function save(event: FormEvent) {
    event.preventDefault(); if (!settings) return;
    if ((settings.privacyMode === 'custom' || !settings.requireConsent) && !window.confirm(
      'This configuration weakens TraceIQ privacy defaults. Confirm that your masking rules, notice, and consent basis have been reviewed.'
    )) return;
    setSaving(true); setMessage(''); const access=await token();
    if (!access) { setSaving(false); return setMessage('Your dashboard session expired.'); }
    const response=await fetch(`${apiBaseUrl}/v1/dashboard/replays/settings`, { method:'PATCH', headers:{Authorization:`Bearer ${access}`,'content-type':'application/json'}, body:JSON.stringify({...settings,projectId:data?.project.id ?? projectId,acknowledgePrivacyRisk:settings.privacyMode==='custom'||!settings.requireConsent}) });
    setSaving(false); if (!response.ok) return setMessage(await readApiError(response));
    const body=await response.json() as {settings:Settings}; setSettings(body.settings); setMessage('Replay settings saved.');
  }
  if (!settings) return <p className="py-8 text-sm text-neutral-500">{message || 'Loading replay settingsâ€¦'}</p>;
  return (
    <form onSubmit={save} className="mt-6 grid max-w-4xl gap-5">
      {!data?.entitlement.available ? <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">Session Replay is not enabled for this TraceIQ Cloud organization. An operator entitlement is required before recording can be switched on.</div> : null}
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <Toggle label="Session Replay" description="Off by default. rrweb is not loaded by the SDK while this is off." checked={settings.enabled} disabled={!data?.entitlement.available} onChange={enabled=>setSettings({...settings,enabled})}/>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <NumberField label="Sample rate (%)" min={0} max={100} value={settings.sampleRate*100} onChange={value=>setSettings({...settings,sampleRate:value/100})}/>
          <NumberField label="Maximum duration (seconds)" min={1} max={14400} value={settings.maxDurationSeconds} onChange={value=>setSettings({...settings,maxDurationSeconds:value})}/>
          <NumberField label="Retention (days)" min={1} max={3650} value={settings.retentionDays} onChange={value=>setSettings({...settings,retentionDays:value})}/>
        </div>
      </section>
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <h2 className="font-semibold">Privacy mode</h2><p className="mt-1 text-sm text-neutral-500">All modes mask every form input and permanently block known credential and payment surfaces before events leave the page.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {(['strict','balanced','custom'] as PrivacyMode[]).map(mode=><label key={mode} className={`rounded-md border p-4 ${settings.privacyMode===mode?'border-blue-500 bg-blue-50 dark:bg-blue-950/20':'border-neutral-200 dark:border-slate-800'}`}><input type="radio" name="privacy" className="mr-2" checked={settings.privacyMode===mode} onChange={()=>setSettings({...settings,privacyMode:mode})}/><span className="font-semibold capitalize">{mode}</span><p className="mt-2 text-xs leading-5 text-neutral-500">{mode==='strict'?'Masks inputs and all visible text.':mode==='balanced'?'Masks all inputs; records ordinary visible text.':'Uses customer selectors in addition to permanent safety rules.'}</p></label>)}
        </div>
        {settings.privacyMode==='custom'?<div className="mt-4 grid gap-3"><SelectorField label="Additional mask selectors" value={settings.maskSelectors} onChange={maskSelectors=>setSettings({...settings,maskSelectors})}/><SelectorField label="Additional block selectors" value={settings.blockSelectors} onChange={blockSelectors=>setSettings({...settings,blockSelectors})}/><SelectorField label="Additional ignore selectors" value={settings.ignoreSelectors} onChange={ignoreSelectors=>setSettings({...settings,ignoreSelectors})}/></div>:null}
      </section>
      <section className="rounded-md border border-neutral-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-950">
        <Toggle label="Require replay consent" description="The recorder will not be imported or started until grantReplayConsent() is called. Your CMP remains the source of truth." checked={settings.requireConsent} onChange={requireConsent=>setSettings({...settings,requireConsent})}/>
        <p className="mt-4 text-xs leading-5 text-neutral-500">Masking is a risk-control, not a guarantee of GDPR, CCPA, or other legal compliance. Already uploaded chunks remain until retention or an authorized deletion request; revocation stops capture immediately and discards unsent events.</p>
      </section>
      {message?<p className="text-sm">{message}</p>:null}
      <button type="submit" disabled={saving} className="w-fit rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60 dark:bg-white dark:text-black">{saving?'Savingâ€¦':'Save replay settings'}</button>
    </form>
  );
}

function Toggle({label,description,checked,onChange,disabled=false}:{label:string;description:string;checked:boolean;onChange:(value:boolean)=>void;disabled?:boolean}){return <label className="flex items-start justify-between gap-6"><span><span className="font-semibold">{label}</span><span className="mt-1 block text-sm text-neutral-500">{description}</span></span><input type="checkbox" checked={checked} disabled={disabled} onChange={e=>onChange(e.target.checked)} className="mt-1 size-5"/></label>}
function NumberField({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}){return <label className="grid gap-1.5 text-xs font-semibold">{label}<input className="h-10 rounded-md border border-neutral-300 bg-transparent px-3 text-sm" type="number" value={value} min={min} max={max} onChange={e=>onChange(Number(e.target.value))}/></label>}
function SelectorField({label,value,onChange}:{label:string;value:string[];onChange:(value:string[])=>void}){return <label className="grid gap-1.5 text-xs font-semibold">{label}<input className="h-10 rounded-md border border-neutral-300 bg-transparent px-3 font-mono text-xs" value={value.join(', ')} onChange={e=>onChange(e.target.value.split(',').map(x=>x.trim()).filter(Boolean))} placeholder=".customer-secret, [data-private]"/></label>}
