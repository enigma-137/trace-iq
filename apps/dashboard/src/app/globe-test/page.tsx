'use client';

import Link from 'next/link';
import { GeographyGlobe } from '@/components/GeographyGlobe';

const SAMPLE_DATA = [
  { name: 'NG', total: 13 },
  { name: 'CN', total: 2 },
  { name: 'BE', total: 1 },
  { name: 'GB', total: 1 },
  { name: 'GH', total: 1 },
  { name: 'IT', total: 1 },
];

export default function GlobeTestPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.24em] text-zinc-400">Globe test page</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">GeographyGlobe render sanity check</h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            This page renders the new <code className="font-mono text-zinc-300">GeographyGlobe</code> component in isolation so you can verify country polygons, intensity mapping, hover tooltips, drag rotation, and zoom.
          </p>
          <Link
            href="/"
            className="inline-flex rounded-full border border-zinc-700 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-50"
          >
            Return to landing page
          </Link>
        </div>

        <div className="relative h-[560px] w-full overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950/60 shadow-[0_0_120px_rgba(255,255,255,0.04)]">
          <GeographyGlobe data={SAMPLE_DATA} metric="visitors" />
          <div className="pointer-events-none absolute bottom-4 left-4 rounded border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-xs text-zinc-400">
            Open browser console for debug logs
          </div>
        </div>
      </div>
    </main>
  );
}
