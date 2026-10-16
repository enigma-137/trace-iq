'use client';

import { useEffect, useState } from 'react';
import { clientFetch } from '@/lib/analytics-api';
import type { CaptureSettings } from '@/lib/requests';

const inputClass =
  'h-8 w-full rounded border border-neutral-200 bg-white px-2 text-xs text-neutral-900 focus:border-neutral-400 focus:outline-none disabled:bg-neutral-50 disabled:text-neutral-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:disabled:bg-slate-900/60';

function toList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function CaptureSettingsPanel({
  projectId,
  canEdit,
  onClose
}: {
  projectId: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const [settings, setSettings] = useState<CaptureSettings | null>(null);
  const [services, setServices] = useState('');
  const [routes, setRoutes] = useState('');
  const [redact, setRedact] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : '';

  useEffect(() => {
    const controller = new AbortController();
    void clientFetch<{ settings: CaptureSettings }>(`/v1/dashboard/requests/capture-settings${query}`, {
      signal: controller.signal
    }).then(({ data, error: loadError }) => {
      if (controller.signal.aborted) return;
      if (loadError || !data) {
        setError(loadError ?? 'Could not load capture settings.');
        return;
      }
      setSettings(data.settings);
      setServices(data.settings.services.join(', '));
      setRoutes(data.settings.routes.join(', '));
      setRedact(data.settings.redactFields.join(', '));
    });
    return () => controller.abort();
  }, [query]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    const { data, error: saveError } = await clientFetch<{ settings: CaptureSettings }>(`/v1/dashboard/requests/capture-settings`, {
      method: 'PUT',
      body: JSON.stringify({
        ...settings,
        projectId,
        services: toList(services),
        routes: toList(routes),
        redactFields: toList(redact)
      })
    });
    setSaving(false);
    if (saveError || !data) {
      setError(saveError ?? 'Could not save capture settings.');
      return;
    }
    setSettings(data.settings);
    setSaved(true);
  };

  const disabled = !canEdit || !settings;

  return (
    <section className="mb-4 border border-neutral-200 bg-white text-xs dark:border-slate-800 dark:bg-slate-950" aria-label="Payload capture settings">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-neutral-900 dark:text-white">Payload capture</h2>
          <p className="text-neutral-500 dark:text-slate-400">
            Off by default. Only applies to SDKs that send payloads; sensitive headers and fields are redacted before storage.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white">
          Close
        </button>
      </div>

      {!settings && !error ? (
        <p className="px-3 py-3 text-neutral-500 dark:text-slate-400">Loading…</p>
      ) : (
        <div className="grid gap-3 px-3 py-3 md:grid-cols-2">
          {settings ? (
            <>
              <fieldset className="space-y-1.5" disabled={disabled}>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
                  <span className="font-medium text-neutral-900 dark:text-slate-100">Capture payloads for this project</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.captureHeaders} onChange={(e) => setSettings({ ...settings, captureHeaders: e.target.checked })} />
                  <span>Headers</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={settings.captureBodies} onChange={(e) => setSettings({ ...settings, captureBodies: e.target.checked })} />
                  <span>Bodies (text and JSON only)</span>
                </label>
                <label className="block pt-1">
                  <span className="mb-1 block text-neutral-500 dark:text-slate-400">Max body size (bytes, ≤ 65536)</span>
                  <input
                    type="number"
                    min={0}
                    max={65536}
                    className={inputClass}
                    value={settings.maxBodyBytes}
                    onChange={(e) => setSettings({ ...settings, maxBodyBytes: Number(e.target.value) })}
                  />
                </label>
              </fieldset>
              <fieldset className="space-y-2" disabled={disabled}>
                <label className="block">
                  <span className="mb-1 block text-neutral-500 dark:text-slate-400">Only these services (comma-separated, empty = all)</span>
                  <input className={inputClass} value={services} onChange={(e) => setServices(e.target.value)} placeholder="billing-api, checkout" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-neutral-500 dark:text-slate-400">Only routes starting with (empty = all)</span>
                  <input className={inputClass} value={routes} onChange={(e) => setRoutes(e.target.value)} placeholder="/api/orders, /api/search" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-neutral-500 dark:text-slate-400">Extra fields to redact</span>
                  <input className={inputClass} value={redact} onChange={(e) => setRedact(e.target.value)} placeholder="customer_ref, internal_note" />
                </label>
              </fieldset>
            </>
          ) : null}
          <div className="flex items-center gap-3 md:col-span-2">
            {canEdit ? (
              <button
                type="button"
                onClick={() => void save()}
                disabled={saving || !settings}
                className="h-8 rounded bg-neutral-900 px-3 font-medium text-white disabled:opacity-60 dark:bg-white dark:text-slate-950"
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <span className="text-neutral-500 dark:text-slate-400">Only owners and admins can change capture settings.</span>
            )}
            {saved ? <span className="text-emerald-700 dark:text-emerald-300">Saved. Applies to newly ingested requests.</span> : null}
            {error ? <span className="text-red-700 dark:text-red-300">{error}</span> : null}
          </div>
        </div>
      )}
    </section>
  );
}
