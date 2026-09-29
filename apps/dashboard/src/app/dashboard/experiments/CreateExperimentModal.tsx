'use client';

import { useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import type { ExperimentVariant } from '@traceiq/types';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface CreateExperimentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (newExp: any) => void;
  projectId?: string | null;
  token?: string | null;
}

export function CreateExperimentModal({
  isOpen,
  onClose,
  onCreated,
  projectId,
  token: initialToken
}: CreateExperimentModalProps) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [description, setDescription] = useState('');
  const [environment, setEnvironment] = useState('production');
  const [primaryMetric, setPrimaryMetric] = useState('checkout_completed');
  const [targetPercentage, setTargetPercentage] = useState(100);
  const [variants, setVariants] = useState<Array<{ id: string; key: string; name: string; weight: number; isControl: boolean }>>([
    { id: 'v_ctrl', key: 'control', name: 'Control (Original)', weight: 50, isControl: true },
    { id: 'v_b', key: 'variant_b', name: 'Variant B', weight: 50, isControl: false }
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  async function getAuthToken(): Promise<string | null> {
    if (initialToken) return initialToken;
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  const handleNameChange = (val: string) => {
    setName(val);
    if (!key || key === slugify(name)) {
      setKey(slugify(val));
    }
  };

  const slugify = (text: string) => {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  };

  const updateVariant = (index: number, updates: Partial<{ key: string; name: string; weight: number }>) => {
    const next = [...variants];
    next[index] = { ...next[index], ...updates };
    setVariants(next);
  };

  const addVariant = () => {
    const nextIdx = variants.length;
    const vKey = `variant_${String.fromCharCode(97 + nextIdx)}`;
    const newVariants = [
      ...variants,
      {
        id: `v_${Date.now()}`,
        key: vKey,
        name: `Variant ${String.fromCharCode(65 + nextIdx)}`,
        weight: 0,
        isControl: false
      }
    ];
    // Re-balance weights evenly
    const evenWeight = Math.floor(100 / newVariants.length);
    newVariants.forEach((v, idx) => {
      v.weight = idx === newVariants.length - 1 ? 100 - evenWeight * (newVariants.length - 1) : evenWeight;
    });
    setVariants(newVariants);
  };

  const removeVariant = (index: number) => {
    if (variants.length <= 2) return; // Keep at least control + 1 variant
    const next = variants.filter((_, idx) => idx !== index);
    const evenWeight = Math.floor(100 / next.length);
    next.forEach((v, idx) => {
      v.weight = idx === next.length - 1 ? 100 - evenWeight * (next.length - 1) : evenWeight;
    });
    setVariants(next);
  };

  const totalWeight = variants.reduce((sum, v) => sum + (Number(v.weight) || 0), 0);

  const handleSubmit = async (e: React.FormEvent, launchImmediately = false) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Experiment name is required.');
      return;
    }
    if (!key.trim()) {
      setError('Experiment key is required.');
      return;
    }
    if (!primaryMetric.trim()) {
      setError('Primary success metric event name is required.');
      return;
    }
    if (totalWeight !== 100) {
      setError(`Variant weights must sum to 100% (currently ${totalWeight}%).`);
      return;
    }

    setLoading(true);
    setError(null);

    const token = await getAuthToken();

    try {
      const url = `${apiBaseUrl}/v1/dashboard/experiments${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          name: name.trim(),
          key: key.trim().toLowerCase(),
          description: description.trim() || undefined,
          environment,
          primaryMetric: primaryMetric.trim(),
          targetPercentage: Number(targetPercentage) || 100,
          variants,
          projectId: projectId || undefined
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to create experiment');
      }

      const created = await res.json();

      if (launchImmediately && created.id) {
        await fetch(`${apiBaseUrl}/v1/dashboard/experiments/${created.id}/status${projectId ? `?projectId=${encodeURIComponent(projectId)}` : ''}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ status: 'running', projectId })
        });
        created.status = 'running';
      }

      onCreated(created);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Error creating experiment');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-neutral-900/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">Create New Experiment</h3>
            <p className="text-xs text-neutral-500 dark:text-slate-400">
              Test variants and measure conversion impact against a control baseline.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <form className="mt-4 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Experiment Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Checkout CTA Color"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Key (Slug) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. checkout-cta-color"
                value={key}
                onChange={(e) => setKey(slugify(e.target.value))}
                className="mt-1 w-full font-mono rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
              Hypothesis / Description (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Making the checkout button high-contrast emerald will increase completion rates by 10%."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Environment
              </label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-neutral-700 dark:text-slate-300">
                Primary Success Metric (Event) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. checkout_completed or signup"
                value={primaryMetric}
                onChange={(e) => setPrimaryMetric(e.target.value)}
                className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-mono text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-hidden dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                required
              />
            </div>
          </div>

          {/* Variants & Traffic Allocation */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50/50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-900 dark:text-white">
                Variants & Traffic Split
              </label>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-semibold ${totalWeight === 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                  Total: {totalWeight}%
                </span>
                <button
                  type="button"
                  onClick={addVariant}
                  className="rounded-md border border-neutral-300 bg-white px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                >
                  + Add Variant
                </button>
              </div>
            </div>

            <div className="space-y-2.5">
              {variants.map((variant, index) => (
                <div
                  key={variant.id}
                  className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-white p-2.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-100 font-bold text-neutral-700 dark:bg-slate-800 dark:text-slate-300">
                    {variant.isControl ? 'C' : String.fromCharCode(65 + index)}
                  </div>

                  <div className="flex-1 space-y-1">
                    <input
                      type="text"
                      placeholder="Variant Name"
                      value={variant.name}
                      onChange={(e) => updateVariant(index, { name: e.target.value })}
                      className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div className="w-28 shrink-0">
                    <input
                      type="text"
                      placeholder="Key"
                      value={variant.key}
                      disabled={variant.isControl}
                      onChange={(e) => updateVariant(index, { key: slugify(e.target.value) })}
                      className="w-full font-mono rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                  </div>

                  <div className="flex items-center gap-1 w-20 shrink-0">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={variant.weight}
                      onChange={(e) => updateVariant(index, { weight: parseInt(e.target.value, 10) || 0 })}
                      className="w-14 rounded-md border border-neutral-200 px-2 py-1 text-center text-xs font-semibold text-neutral-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    />
                    <span className="text-neutral-500">%</span>
                  </div>

                  {!variant.isControl && variants.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeVariant(index)}
                      className="p-1 text-neutral-400 hover:text-red-600 dark:hover:text-red-400"
                      title="Remove variant"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={loading}
                onClick={(e) => handleSubmit(e, false)}
                className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={loading || totalWeight !== 100}
                onClick={(e) => handleSubmit(e, true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Launch Experiment'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
