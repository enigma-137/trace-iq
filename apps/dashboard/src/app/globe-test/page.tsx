'use client';

import Link from 'next/link';
import GlobeHero from '@/components/globe-hero';

export default function GlobeTestPage() {
  return (
    <main className="min-h-screen bg-[#050505] text-zinc-50">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center gap-10 px-4 py-16 sm:px-6 lg:px-8">
        <div className="space-y-4 text-center">
          <p className="text-sm uppercase tracking-[0.24em] text-zinc-400">Globe test page</p>
          <h1 className="text-4xl font-extrabold sm:text-5xl">GlobeHero render sanity check</h1>
          <p className="mx-auto max-w-2xl text-sm leading-7 text-zinc-400 sm:text-base">
            This page renders the `GlobeHero` component in isolation so you can verify the Three.js canvas and wrapper sizing outside the main hero.
          </p>
          <Link
            href="/"
            className="inline-flex rounded-full border border-zinc-700 bg-zinc-900/80 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:text-zinc-50"
          >
            Return to landing page
          </Link>
        </div>

        <div className="relative h-[560px] w-full overflow-hidden rounded-[2rem] border border-zinc-800 bg-zinc-950/60 shadow-[0_0_120px_rgba(255,255,255,0.04)]">
          <GlobeHero />
        </div>
      </div>
    </main>
  );
}
