import Link from 'next/link';
import { BarChart } from '@/components/charts/BarChart';
import { StatTile } from '@/components/charts/StatTile';
import { GROWTH_RANGES, type AdminGrowth, type AdminGrowthLabelCount } from '@/lib/admin';

const cardClass =
  'rounded-md border border-neutral-200 bg-white p-5 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/80 dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]';
const labelClass = 'text-[11px] font-semibold uppercase tracking-[0.1em] text-neutral-400 dark:text-slate-500';

const METHOD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Password',
  oauth: 'OAuth',
  otp: 'Magic link',
  magiclink: 'Magic link',
  github: 'GitHub',
  google: 'Google',
  sso: 'SSO',
  unknown: 'Unknown'
};

const methodLabel = (method: string | null) => (method ? METHOD_LABELS[method] ?? method : '—');

function dayLabel(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function relativeText(iso: string): string {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Platform growth: who visits the public site, signs up, signs in and keeps using TraceIQ. */
export function AdminGrowthSection({ growth }: { growth: AdminGrowth }) {
  const { totals, active, accounts, daily, rangeDays } = growth;
  const bars = (key: 'visitors' | 'signUps' | 'activeUsers' | 'signIns') =>
    daily.map((point) => ({ label: dayLabel(point.day), value: point[key] }));

  return (
    <section className="mb-6">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-3 px-0.5">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-neutral-900 dark:text-white">Growth</h2>
          <p className="text-xs text-neutral-400 dark:text-slate-500">
            Public-site visitors, sign-ups, sign-ins and active users · last {rangeDays} days (UTC)
          </p>
        </div>
        <nav aria-label="Growth range" className="inline-flex rounded-md border border-neutral-200 bg-white p-0.5 dark:border-slate-800 dark:bg-slate-900">
          {GROWTH_RANGES.map((days) => (
            <Link
              key={days}
              href={days === 30 ? '/admin' : `/admin?growth=${days}`}
              scroll={false}
              aria-current={days === rangeDays ? 'page' : undefined}
              className={`rounded px-2.5 py-1 text-xs font-semibold tabular-nums transition ${
                days === rangeDays
                  ? 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                  : 'text-neutral-500 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {days}d
            </Link>
          ))}
        </nav>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Visitors" value={totals.visitors.toLocaleString()} hint={`${totals.pageviews.toLocaleString()} pageviews`} />
        <StatTile
          label="Sign-ups"
          value={accounts ? totals.signUps.toLocaleString() : '—'}
          hint={
            accounts
              ? `${totals.conversionRate === null ? '–' : `${totals.conversionRate}%`} of visitors · ${accounts.total.toLocaleString()} accounts`
              : 'Needs SUPABASE_SERVICE_ROLE_KEY on the API'
          }
          tone="green"
        />
        <StatTile label="Sign-ins" value={totals.signIns.toLocaleString()} hint={`${growth.recentSignIns.length ? `Last ${relativeText(growth.recentSignIns[0].signedInAt)}` : 'None yet'}`} />
        <StatTile label="Active today" value={active.dau.toLocaleString()} hint={`${active.wau} this week · ${active.mau} in 30 days`} tone="blue" />
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-2">
        <ChartCard title="Visitors per day" total={totals.visitors}>
          <BarChart items={bars('visitors')} tone="blue" height={160} className="h-40 w-full" emptyLabel="No visitors yet." />
        </ChartCard>
        <ChartCard title="Sign-ups per day" total={totals.signUps}>
          <BarChart items={bars('signUps')} tone="green" height={160} className="h-40 w-full" emptyLabel="No sign-ups yet." />
        </ChartCard>
        <ChartCard title="Active users per day" total={null}>
          <BarChart items={bars('activeUsers')} tone="amber" height={160} className="h-40 w-full" emptyLabel="No activity yet." />
        </ChartCard>
        <ChartCard title="Sign-ins per day" total={totals.signIns}>
          <BarChart items={bars('signIns')} tone="blue" height={160} className="h-40 w-full" emptyLabel="No sign-ins yet." />
        </ChartCard>
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        <ListCard title="Top pages" unit="views" items={growth.topPages} mono emptyLabel="No pageviews yet." />
        <ListCard title="Top sources" unit="visitors" items={growth.topSources} emptyLabel="No visitors yet." />
        <div className={cardClass}>
          <p className={`${labelClass} mb-3`}>Devices and methods</p>
          <Breakdown title="Visitor devices" items={growth.devices} />
          <Breakdown title="Sign-up method" items={growth.signUpMethods} labels />
          <Breakdown title="Sign-in method" items={growth.signInMethods} labels />
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <PeopleCard
          title="Recent sign-ups"
          emptyLabel={accounts ? 'No sign-ups yet.' : 'Sign-ups need the Supabase service-role key on the API.'}
          rows={growth.recentSignUps.map((row) => ({
            email: row.email,
            detail: `${methodLabel(row.provider)}${row.confirmed ? '' : ' · unconfirmed'}`,
            at: row.createdAt
          }))}
        />
        <PeopleCard
          title="Recent sign-ins"
          emptyLabel="No sign-ins recorded yet."
          rows={growth.recentSignIns.map((row) => ({ email: row.email, detail: methodLabel(row.method), at: row.signedInAt }))}
        />
        <PeopleCard
          title="Recently active"
          emptyLabel="No activity recorded yet."
          rows={growth.recentlyActive.map((row) => ({ email: row.email, detail: null, at: row.lastSeenAt }))}
        />
      </div>
    </section>
  );
}

function ChartCard({ title, total, children }: { title: string; total: number | null; children: React.ReactNode }) {
  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-3">
        <p className={labelClass}>{title}</p>
        {total !== null ? (
          <span className="text-xs font-semibold tabular-nums text-neutral-600 dark:text-slate-300">{total.toLocaleString()} total</span>
        ) : null}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function ListCard({
  title,
  unit,
  items,
  mono = false,
  emptyLabel
}: {
  title: string;
  unit: string;
  items: AdminGrowthLabelCount[];
  mono?: boolean;
  emptyLabel: string;
}) {
  const max = Math.max(1, ...items.map((item) => item.total));
  return (
    <div className={cardClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className={labelClass}>{title}</p>
        <span className="text-[11px] text-neutral-400 dark:text-slate-500">{unit}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul className="grid gap-2">
          {items.map((item) => (
            <li key={item.label} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className={`truncate text-sm text-neutral-800 dark:text-neutral-200 ${mono ? 'font-mono text-[13px]' : ''}`} title={item.label}>
                  {item.label}
                </span>
                <span className="text-sm tabular-nums text-neutral-500 dark:text-neutral-400">{item.total.toLocaleString()}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-slate-800">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${(item.total / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Breakdown({ title, items, labels = false }: { title: string; items: AdminGrowthLabelCount[]; labels?: boolean }) {
  const total = items.reduce((sum, item) => sum + item.total, 0);
  return (
    <div className="mb-3 last:mb-0">
      <p className="mb-1 text-xs font-medium text-neutral-500 dark:text-slate-400">{title}</p>
      {total === 0 ? (
        <p className="text-xs text-neutral-400 dark:text-slate-500">No data yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((item) => (
            <span
              key={item.label}
              className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs tabular-nums text-neutral-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {labels ? methodLabel(item.label) : item.label.charAt(0).toUpperCase() + item.label.slice(1)}{' '}
              <span className="text-neutral-400 dark:text-slate-500">{Math.round((item.total / total) * 100)}%</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PeopleCard({
  title,
  rows,
  emptyLabel
}: {
  title: string;
  rows: Array<{ email: string | null; detail: string | null; at: string }>;
  emptyLabel: string;
}) {
  return (
    <div className={cardClass}>
      <p className={`${labelClass} mb-2`}>{title}</p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">{emptyLabel}</p>
      ) : (
        <ul className="divide-y divide-neutral-100 dark:divide-slate-800/80">
          {rows.map((row, index) => (
            <li key={`${row.email}-${row.at}-${index}`} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-neutral-900 dark:text-white">{row.email ?? 'Unknown'}</p>
                {row.detail ? <p className="text-xs text-neutral-400 dark:text-slate-500">{row.detail}</p> : null}
              </div>
              <span className="shrink-0 text-xs tabular-nums text-neutral-400 dark:text-slate-500" title={new Date(row.at).toISOString()}>
                {relativeText(row.at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
