import type { Metadata } from 'next';
import Link from 'next/link';
import { HugeiconsIcon } from '@hugeicons/react';
import ArrowUpRight01Icon from '@hugeicons/core-free-icons/ArrowUpRight01Icon';
import { PublicPage } from '@/components/PublicSiteChrome';
import { formatPostDate } from '@/lib/blog';
import { posts } from './posts';

export const metadata: Metadata = { title: 'Blog', description: 'Notes on self-hosted analytics, product telemetry, privacy and building TraceIQ.' };

export default function BlogPage() {
  return <PublicPage><main className="mx-auto max-w-5xl px-5 py-20 sm:px-8 sm:py-28"><header className="max-w-3xl"><p className="font-mono text-xs uppercase tracking-[0.16em] text-blue-400">TraceIQ journal</p><h1 className="mt-4 text-5xl font-semibold tracking-tight sm:text-6xl">Building analytics<br /><span className="text-zinc-500">in the open.</span></h1><p className="mt-6 text-lg leading-8 text-zinc-400">Engineering notes, product decisions and clear-eyed comparisons for teams deciding how to understand their users.</p></header><section className="mt-14 grid gap-4">{posts.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`} className="group rounded-xl border border-white/10 bg-white/[0.025] p-6 transition hover:border-white/20 hover:bg-white/[0.045] sm:p-8"><div className="flex flex-wrap items-center gap-3 font-mono text-xs uppercase tracking-wide text-zinc-500"><span className="text-blue-400">{post.tag}</span><span>{formatPostDate(post.date)}</span><span>{post.readTime}</span></div><div className="mt-4 flex items-start justify-between gap-5"><div><h2 className="text-2xl font-semibold tracking-tight group-hover:text-white sm:text-3xl">{post.title}</h2><p className="mt-3 max-w-3xl leading-7 text-zinc-400">{post.description}</p></div><HugeiconsIcon icon={ArrowUpRight01Icon} size={20} className="mt-1 shrink-0 text-zinc-600 transition group-hover:text-white" /></div></Link>)}</section></main></PublicPage>;
}
