'use client';

import dynamic from 'next/dynamic';

const GeographyGlobe = dynamic(
  () => import('@/components/GeographyGlobe').then((module) => module.GeographyGlobe),
  { ssr: false, loading: () => <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading globe…</div> }
);

export function OverviewGeographyGlobe({ data }: { data: Array<{ name: string; total: number }> }) {
  return <GeographyGlobe data={data} metric="events" />;
}
