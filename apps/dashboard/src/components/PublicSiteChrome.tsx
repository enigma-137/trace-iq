import Link from 'next/link';
import type { ReactNode } from 'react';

const links = [
  { href: '/docs', label: 'Resources' },
  { href: '/status', label: 'Status' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' }
];

export function PublicSiteHeader() {
  return <header className="border-b border-white/10 bg-[#070709]/90 backdrop-blur">
    <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
      <Link href="/" aria-label="TraceIQ home"><img src="/brand/logo-white-no-bg.png" alt="TraceIQ" className="h-7 w-auto" /></Link>
      <nav className="hidden items-center gap-6 text-sm text-zinc-300 sm:flex" aria-label="Primary navigation">{links.map((link) => <Link key={link.href} href={link.href} className="transition hover:text-white">{link.label}</Link>)}</nav>
      <Link href="/waitlist" className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-black transition hover:bg-zinc-200">Get started</Link>
    </div>
  </header>;
}

export function PublicSiteFooter() {
  return <footer className="border-t border-white/10 py-8 text-sm text-zinc-500"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 sm:px-8"><span>© {new Date().getFullYear()} TraceIQ</span><nav className="flex flex-wrap gap-5">{links.map((link) => <Link key={link.href} href={link.href} className="hover:text-zinc-200">{link.label}</Link>)}<Link href="/privacy" className="hover:text-zinc-200">Privacy</Link></nav></div></footer>;
}

export function PublicPage({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-[#070709] text-zinc-100"><PublicSiteHeader />{children}<PublicSiteFooter /></div>;
}
