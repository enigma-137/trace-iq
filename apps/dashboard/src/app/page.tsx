'use client';

import { useState } from 'react';
import { ArrowRight, Menu, X } from 'lucide-react';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingProductOverview } from '@/components/landing/LandingProductOverview';
import styles from './landing-light.module.css';

const navigation = [['Product', '#product'], ['Docs', '/docs'], ['Pricing', '/pricing']] as const;
const steps = [
  ['Connect your SDK', 'Add TraceIQ to your product and configure your project.'],
  ['Collect events', 'Bring user events, errors, and performance data together.'],
  ['Investigate', 'Follow every event to see what happened and why.'],
];

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={styles.site} id="top">
      <a className={styles.skipLink} href="#main-content">Skip to content</a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a className={styles.wordmark} href="#top" aria-label="TraceIQ home">TraceIQ</a>
          <nav className={styles.desktopNav} aria-label="Primary navigation">
            {navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}
          </nav>
          <a className={`${styles.button} ${styles.headerCta}`} href="/auth/login">Explore TraceIQ <ArrowRight size={16} aria-hidden="true" /></a>
          <button className={styles.menuButton} type="button" aria-expanded={menuOpen} aria-controls="mobile-navigation" aria-label={menuOpen ? 'Close menu' : 'Open menu'} onClick={() => setMenuOpen(!menuOpen)}>
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <nav className={styles.mobileNav} id="mobile-navigation" aria-label="Mobile navigation" onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setMenuOpen(false);
              document.querySelector<HTMLButtonElement>('[aria-controls="mobile-navigation"]')?.focus();
            }
          }}>
            {navigation.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          </nav>
        )}
      </header>

      <main id="main-content" tabIndex={-1}>
        <LandingHero />
        <LandingProductOverview />
        <section className={`${styles.container} ${styles.setup}`} aria-label="Get started with TraceIQ">
          <ol>
            {steps.map(([title, description], index) => (
              <li key={title}><span className={styles.stepNumber}>0{index + 1}</span><div><h3>{title}</h3><p>{description}</p>{index === 0 && <a href="/docs">Read the setup guide <ArrowRight size={13} aria-hidden="true" /></a>}</div></li>
            ))}
          </ol>
        </section>
        <section className={`${styles.container} ${styles.closing}`} aria-labelledby="closing-heading">
          <span className={styles.closingAccent} aria-hidden="true">▲</span>
          <div><h2 id="closing-heading">Bring your product into focus.</h2><p>Understand user behavior. Investigate errors. See the full picture.</p></div>
          <a className={styles.button} href="/auth/login">Explore TraceIQ <ArrowRight size={17} aria-hidden="true" /></a>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerTop}>
            <div className={styles.footerBrand}><a href="#top" className={styles.footerWordmark}>TraceIQ</a><p>Product analytics and<br />observability, connected.</p></div>
            <nav className={styles.footerLinks} aria-label="Footer navigation">
              <div><h3>Product</h3><a href="#product">Overview</a><a href="/pricing">Pricing</a><a href="/status">System status</a></div>
              <div><h3>Resources</h3><a href="/docs">Docs</a><a href="/blog">Blog</a><a href="/docs?page=quickstart">SDK setup</a></div>
              <div><h3>Company</h3><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="mailto:traceiq.run@gmail.com">Contact</a></div>
            </nav>
          </div>
          <div className={styles.footerBottom}><span>© {new Date().getFullYear()} TraceIQ</span><span>Make complexity legible.</span><a href="#top">Back to top ↑</a></div>
        </div>
      </footer>
    </div>
  );
}
