'use client';

import { FormEvent, type ReactNode, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { DashboardDialog } from '../DashboardDialog';
import { readApiError } from '@/lib/api-error';
import { toast } from '@/lib/toast';
import { retryAfterStepUp } from '@/lib/step-up';
import type { ShortLink } from './page';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface LinkStats {
  link: ShortLink;
  days: number;
  series: Array<{ day: string; clicks: number }>;
  referrers: Array<{ name: string; clicks: number }>;
  countries: Array<{ name: string; clicks: number }>;
  devices: Array<{ name: string; clicks: number }>;
}

interface Draft {
  destinationUrl: string;
  slug: string;
  title: string;
  utmSource: string;
  utmMedium: string;
  utmCampaign: string;
  expiresAt: string;
}

const emptyDraft: Draft = {
  destinationUrl: '',
  slug: '',
  title: '',
  utmSource: '',
  utmMedium: '',
  utmCampaign: '',
  expiresAt: ''
};

export function LinkManager({
  initialLinks,
  metrics,
  baseUrl,
  projectId
}: {
  initialLinks: ShortLink[];
  metrics: { links: number; clicks7d: number; clicksTotal: number };
  baseUrl: string;
  projectId?: string;
}) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const router = useRouter();
  const [links, setLinks] = useState(initialLinks);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<LinkStats | null>(null);
  const [loadingStats, setLoadingStats] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ShortLink | null>(null);

  async function getToken(): Promise<string | null> {
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function authFetch(path: string, init: RequestInit = {}): Promise<Response | null> {
    const response = await sendAuthed(path, init);
    return response ? retryAfterStepUp(response, () => sendAuthed(path, init)) : null;
  }

  async function sendAuthed(path: string, init: RequestInit): Promise<Response | null> {
    const token = await getToken();
    if (!token) {
      toast.error('Your dashboard session expired. Sign in again.');
      return null;
    }
    const queryChar = path.includes('?') ? '&' : '?';
    const targetUrl = `${apiBaseUrl}${path}${projectId ? `${queryChar}projectId=${encodeURIComponent(projectId)}` : ''}`;
    return fetch(targetUrl, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {})
      }
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (link) =>
        link.slug.includes(q) ||
        link.destinationUrl.toLowerCase().includes(q) ||
        (link.title ?? '').toLowerCase().includes(q) ||
        (link.utmCampaign ?? '').toLowerCase().includes(q)
    );
  }, [links, search]);

  async function createLink(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const response = await authFetch('/v1/dashboard/links', {
        method: 'POST',
        body: JSON.stringify({
          projectId,
          destinationUrl: draft.destinationUrl,
          slug: draft.slug || undefined,
          title: draft.title || null,
          utmSource: draft.utmSource || null,
          utmMedium: draft.utmMedium || null,
          utmCampaign: draft.utmCampaign || null,
          expiresAt: draft.expiresAt ? new Date(draft.expiresAt).toISOString() : null
        })
      });
      if (!response) return;
      if (!response.ok) {
        toast.error(await readApiError(response, 'Could not create the link.'));
        return;
      }
      const link = (await response.json()) as ShortLink;
      setLinks((current) => [link, ...current]);
      setCreateOpen(false);
      setDraft(emptyDraft);
      await copy(link.shortUrl, 'Link created and copied');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function openStats(link: ShortLink) {
    setLoadingStats(link.id);
    try {
      const response = await authFetch(`/v1/dashboard/links/${link.id}?days=30`);
      if (!response) return;
      if (!response.ok) {
        toast.error(await readApiError(response, 'Could not load clicks for this link.'));
        return;
      }
      setSelected((await response.json()) as LinkStats);
    } finally {
      setLoadingStats(null);
    }
  }

  async function setArchived(link: ShortLink, archived: boolean) {
    const response = await authFetch(`/v1/dashboard/links/${link.id}/${archived ? 'archive' : 'restore'}`, {
      method: 'POST',
      body: JSON.stringify({ projectId })
    });
    if (!response) return;
    if (!response.ok) {
      toast.error(await readApiError(response, 'Could not update the link.'));
      return;
    }
    setLinks((current) => current.filter((item) => item.id !== link.id));
    toast.success(archived ? 'Link archived. It no longer redirects.' : 'Link restored.');
    router.refresh();
  }

  async function deleteLink(link: ShortLink) {
    const response = await authFetch(`/v1/dashboard/links/${link.id}`, { method: 'DELETE' });
    if (!response) return;
    if (!response.ok) {
      toast.error(await readApiError(response, 'Could not delete the link.'));
      return;
    }
    setLinks((current) => current.filter((item) => item.id !== link.id));
    setPendingDelete(null);
    if (selected?.link.id === link.id) setSelected(null);
    toast.success('Link deleted. Its past clicks stay in your events.');
    router.refresh();
  }

  async function copy(text: string, message = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(message);
    } catch {
      toast.error('Could not copy. Select the link and copy it manually.');
    }
  }

  const update = (field: keyof Draft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  return (
    <div className="grid gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">Short links</h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-slate-400">
            Share short links in posts, emails and campaigns. Every click becomes a <code className="font-mono text-xs">$link_click</code> event you
            can use in funnels, trends and alerts.
          </p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} className={primaryButton}>
          <PlusIcon />
          Create link
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <MetricCard label="Active links" value={metrics.links} />
        <MetricCard label="Clicks, last 7 days" value={metrics.clicks7d.toLocaleString()} />
        <MetricCard label="Clicks, all time" value={metrics.clicksTotal.toLocaleString()} />
      </div>

      {links.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-950">
          <h2 className="text-base font-semibold text-neutral-900 dark:text-white">No short links yet</h2>
          <p className="mt-1.5 max-w-sm text-sm text-neutral-500 dark:text-slate-400">
            Create one for your next launch post. Add UTM tags and you can break signups down by campaign to see which link brought
            customers.
          </p>
          <button type="button" onClick={() => setCreateOpen(true)} className={`${primaryButton} mt-6`}>
            Create your first link
          </button>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-neutral-900 dark:text-white">Links</span>
              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-slate-800 dark:text-slate-300">
                {links.length}
              </span>
            </div>
            <input
              type="search"
              className={searchClass}
              placeholder="Search links…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search links"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 bg-neutral-50/50 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:border-slate-800 dark:bg-slate-900/30 dark:text-slate-400">
                <tr>
                  <th scope="col" className="py-3.5 pl-5 pr-3">Link</th>
                  <th scope="col" className="px-3 py-3.5">Destination</th>
                  <th scope="col" className="px-3 py-3.5 text-right">Clicks</th>
                  <th scope="col" className="px-3 py-3.5">Last click</th>
                  <th scope="col" className="py-3.5 pl-3 pr-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-slate-800">
                {filtered.map((link) => (
                  <tr key={link.id} className="align-top">
                    <td className="py-3.5 pl-5 pr-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-neutral-900 dark:text-white">/l/{link.slug}</span>
                        <button
                          type="button"
                          onClick={() => copy(link.shortUrl)}
                          className="rounded px-1.5 py-0.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          aria-label={`Copy ${link.shortUrl}`}
                        >
                          Copy
                        </button>
                      </div>
                      {link.title ? <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">{link.title}</p> : null}
                      <LinkBadges link={link} />
                    </td>
                    <td className="max-w-[320px] px-3 py-3.5">
                      <a
                        href={link.destinationUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="block truncate text-xs text-neutral-600 hover:underline dark:text-slate-300"
                        title={link.destinationUrl}
                      >
                        {link.destinationUrl}
                      </a>
                    </td>
                    <td className="px-3 py-3.5 text-right font-semibold tabular-nums text-neutral-900 dark:text-white">
                      {link.clickCount.toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-3 py-3.5 text-xs text-neutral-500 dark:text-slate-400">
                      {link.lastClickedAt ? relativeTime(link.lastClickedAt) : 'No clicks yet'}
                    </td>
                    <td className="whitespace-nowrap py-3.5 pl-3 pr-5 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button type="button" className={ghostButton} onClick={() => openStats(link)} disabled={loadingStats === link.id}>
                          {loadingStats === link.id ? 'Loading…' : 'Clicks'}
                        </button>
                        <button type="button" className={ghostButton} onClick={() => setArchived(link, true)}>
                          Archive
                        </button>
                        <button type="button" className={`${ghostButton} text-red-600 dark:text-red-400`} onClick={() => setPendingDelete(link)}>
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-neutral-500 dark:text-slate-400">
                      No links match &ldquo;{search}&rdquo;.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selected ? <LinkStatsPanel stats={selected} onClose={() => setSelected(null)} onCopy={copy} /> : null}

      <DashboardDialog
        open={createOpen}
        title="Create short link"
        description={baseUrl ? `Links look like ${baseUrl}/l/your-slug.` : undefined}
        onClose={() => setCreateOpen(false)}
        maxWidthClass="max-w-xl"
      >
        <form className="grid gap-4" onSubmit={createLink}>
          <Field label="Destination URL" hint="Where people end up. Must start with https:// or http://.">
            <input
              className={inputClass}
              type="url"
              required
              placeholder="https://example.com/pricing"
              value={draft.destinationUrl}
              onChange={update('destinationUrl')}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Slug" hint="Optional. Leave empty for a random one.">
              <input className={inputClass} placeholder="launch" value={draft.slug} onChange={update('slug')} maxLength={64} />
            </Field>
            <Field label="Title" hint="Optional. Only you see it.">
              <input className={inputClass} placeholder="Launch tweet" value={draft.title} onChange={update('title')} maxLength={200} />
            </Field>
          </div>
          <fieldset className="grid gap-3 rounded-lg border border-neutral-200 p-3 dark:border-slate-800">
            <legend className="px-1 text-xs font-semibold text-neutral-700 dark:text-slate-300">UTM tags (optional)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Source">
                <input className={inputClass} placeholder="twitter" value={draft.utmSource} onChange={update('utmSource')} />
              </Field>
              <Field label="Medium">
                <input className={inputClass} placeholder="social" value={draft.utmMedium} onChange={update('utmMedium')} />
              </Field>
              <Field label="Campaign">
                <input className={inputClass} placeholder="launch" value={draft.utmCampaign} onChange={update('utmCampaign')} />
              </Field>
            </div>
          </fieldset>
          <Field label="Expires" hint="Optional. After this, the link shows an expired page.">
            <input className={inputClass} type="datetime-local" value={draft.expiresAt} onChange={update('expiresAt')} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className={secondaryButton} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
            <button type="submit" className={primaryButton} disabled={saving}>
              {saving ? 'Creating…' : 'Create and copy'}
            </button>
          </div>
        </form>
      </DashboardDialog>

      <DashboardDialog
        open={Boolean(pendingDelete)}
        title="Delete this link?"
        description={
          pendingDelete
            ? `/l/${pendingDelete.slug} will stop working and the slug can be reused. Past clicks stay in your events. Archive it instead if you might want it back.`
            : undefined
        }
        onClose={() => setPendingDelete(null)}
      >
        <div className="flex justify-end gap-2">
          <button type="button" className={secondaryButton} onClick={() => setPendingDelete(null)}>
            Cancel
          </button>
          <button
            type="button"
            className="inline-flex h-10 items-center rounded-md bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
            onClick={() => pendingDelete && deleteLink(pendingDelete)}
          >
            Delete link
          </button>
        </div>
      </DashboardDialog>
    </div>
  );
}

function LinkStatsPanel({
  stats,
  onClose,
  onCopy
}: {
  stats: LinkStats;
  onClose: () => void;
  onCopy: (text: string) => void;
}) {
  const max = Math.max(1, ...stats.series.map((point) => point.clicks));
  const total = stats.series.reduce((sum, point) => sum + point.clicks, 0);
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-sm font-semibold text-neutral-900 dark:text-white">/l/{stats.link.slug}</h2>
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-slate-400">
            {total.toLocaleString()} clicks in the last {stats.days} days
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryButton} onClick={() => onCopy(stats.link.shortUrl)}>
            Copy link
          </button>
          <button type="button" className={secondaryButton} onClick={onClose}>
            Close
          </button>
        </div>
      </div>

      <div className="mt-5 flex h-28 items-end gap-[3px]" role="img" aria-label={`Daily clicks over the last ${stats.days} days`}>
        {stats.series.map((point) => (
          <div
            key={point.day}
            title={`${point.day}: ${point.clicks} clicks`}
            className="flex-1 rounded-t-sm bg-neutral-900 dark:bg-white"
            style={{ height: `${Math.max(point.clicks === 0 ? 2 : 6, (point.clicks / max) * 100)}%`, opacity: point.clicks === 0 ? 0.15 : 1 }}
          />
        ))}
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-3">
        <Breakdown title="Referrers" rows={stats.referrers} total={total} />
        <Breakdown title="Countries" rows={stats.countries} total={total} />
        <Breakdown title="Devices" rows={stats.devices} total={total} />
      </div>
      <p className="mt-5 text-xs text-neutral-500 dark:text-slate-400">
        Filter <code className="font-mono">$link_click</code> by <code className="font-mono">slug = {stats.link.slug}</code> in Insights to chart these
        clicks next to your other events.
      </p>
    </section>
  );
}

function Breakdown({ title, rows, total }: { title: string; rows: Array<{ name: string; clicks: number }>; total: number }) {
  return (
    <div>
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-slate-400">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-400 dark:text-slate-500">No clicks yet</p>
      ) : (
        <ul className="mt-2 grid gap-1.5">
          {rows.map((row) => (
            <li key={row.name} className="relative overflow-hidden rounded bg-neutral-50 px-2 py-1 text-xs dark:bg-slate-900">
              <span
                className="absolute inset-y-0 left-0 bg-neutral-200 dark:bg-slate-700"
                style={{ width: `${total ? (row.clicks / total) * 100 : 0}%` }}
                aria-hidden="true"
              />
              <span className="relative flex justify-between gap-2">
                <span className="truncate text-neutral-800 dark:text-slate-200">{row.name}</span>
                <span className="tabular-nums text-neutral-500 dark:text-slate-400">{row.clicks}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkBadges({ link }: { link: ShortLink }) {
  const utm = [link.utmSource, link.utmMedium, link.utmCampaign].filter(Boolean).join(' · ');
  const expired = link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now();
  if (!utm && !link.expiresAt) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {utm ? (
        <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-600 dark:bg-slate-800 dark:text-slate-300">{utm}</span>
      ) : null}
      {link.expiresAt ? (
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
            expired
              ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
          }`}
        >
          {expired ? 'Expired' : `Expires ${new Date(link.expiresAt).toLocaleDateString()}`}
        </span>
      ) : null}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-medium text-neutral-700 dark:text-slate-300">
      {label}
      {children}
      {hint ? <span className="text-[11px] font-normal text-neutral-500 dark:text-slate-500">{hint}</span> : null}
    </label>
  );
}

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <span className="text-xs font-medium text-neutral-500 dark:text-slate-400">{label}</span>
      <p className="mt-1.5 text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">{value}</p>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function relativeTime(iso: string) {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

const primaryButton =
  'inline-flex h-10 items-center justify-center gap-2 rounded-md bg-neutral-900 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-slate-200';
const secondaryButton =
  'inline-flex h-9 items-center justify-center rounded-md border border-neutral-300 bg-white px-3 text-xs font-semibold text-neutral-800 transition hover:bg-neutral-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';
const ghostButton =
  'rounded-md px-2 py-1 text-xs font-medium text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white';
const inputClass =
  'min-h-10 w-full rounded-md border border-neutral-300 bg-white px-3 text-xs font-normal normal-case text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-600 dark:focus:border-white dark:focus:ring-white/10';
const searchClass =
  'h-8 w-48 rounded-md border border-neutral-300 bg-white px-2.5 text-xs text-neutral-900 outline-none placeholder:text-neutral-400 focus:border-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';
