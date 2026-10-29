import { DashboardShell } from '../DashboardShell';
import { dashboardGet, requireDashboardSession } from '@/lib/dashboard';
import { LinkManager } from './LinkManager';

export const dynamic = 'force-dynamic';

export interface ShortLink {
  id: string;
  slug: string;
  shortUrl: string;
  destinationUrl: string;
  title: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  expiresAt: string | null;
  archivedAt: string | null;
  clickCount: number;
  lastClickedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LinksResponse {
  project: { id: string; name?: string } | null;
  baseUrl: string;
  links: ShortLink[];
  metrics: { links: number; clicks7d: number; clicksTotal: number };
}

export default async function LinksPage() {
  const { user, token } = await requireDashboardSession('/dashboard/links');
  const { data, error } = await dashboardGet<LinksResponse>('/v1/dashboard/links', token);

  return (
    <DashboardShell active="links" title="Short links" userEmail={user.email}>
      {error ? (
        <section className="mb-4 rounded-md border border-neutral-300 bg-neutral-100 px-4 py-3 text-sm text-neutral-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
          {error}
        </section>
      ) : null}

      <LinkManager
        initialLinks={data?.links ?? []}
        metrics={data?.metrics ?? { links: 0, clicks7d: 0, clicksTotal: 0 }}
        baseUrl={data?.baseUrl ?? ''}
        projectId={data?.project?.id}
      />
    </DashboardShell>
  );
}
