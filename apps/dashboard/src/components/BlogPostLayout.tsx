import type { ReactNode } from 'react';
import { PublicPage } from './PublicSiteChrome';

export function BlogPostLayout({ title, description, date, readTime, children }: { title: string; description: string; date: string; readTime: string; children: ReactNode }) {
  return <PublicPage><main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24"><a href="/blog" className="text-sm text-blue-400 hover:text-blue-300">← All posts</a><header className="mt-8 border-b border-white/10 pb-10"><div className="font-mono text-xs uppercase tracking-[0.16em] text-zinc-500">{date} · {readTime}</div><h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">{title}</h1><p className="mt-5 text-lg leading-8 text-zinc-400">{description}</p></header><article className="blog-prose mt-10">{children}</article></main></PublicPage>;
}
