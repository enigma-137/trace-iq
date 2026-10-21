"use client";

import { useState } from "react";
import { ArrowRight, ArrowUp, Menu, X } from "lucide-react";
import { LandingHero } from "@/components/landing/LandingHero";
import { LandingProductOverview } from "@/components/landing/LandingProductOverview";
import styles from "./landing-light.module.css";

const navigation = [
  ["Product", "#product"],
  ["Docs", "/docs"],
  ["Pricing", "/pricing"],
  ["GitHub", "https://github.com/enigma-137/trace-iq"],
] as const;
const steps = [
  [
    "Connect your SDK",
    "Add TraceIQ to your stack and configure the events you want to capture.",
  ],
  [
    "Collect events",
    "Bring user activity, errors, and performance data into one place.",
  ],
  [
    "Investigate",
    "Follow the story from a user action to the system behavior behind it.",
  ],
];

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={styles.site} id="top">
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={`${styles.frame} ${styles.headerInner}`}>
          <a className={styles.wordmark} href="#top" aria-label="TraceIQ home">
            TraceIQ<span aria-hidden="true">.</span>
          </a>
          <nav className={styles.desktopNav} aria-label="Primary navigation">
            {navigation.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <a
            className={`${styles.button} ${styles.headerCta}`}
            href="/auth/login"
          >
            Explore TraceIQ <ArrowRight size={14} aria-hidden="true" />
          </a>
          <button
            className={styles.menuButton}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
        {menuOpen && (
          <nav
            className={styles.mobileNav}
            id="mobile-navigation"
            aria-label="Mobile navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setMenuOpen(false);
                document
                  .querySelector<HTMLButtonElement>(
                    '[aria-controls="mobile-navigation"]',
                  )
                  ?.focus();
              }
            }}
          >
            {navigation.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        <LandingHero />
        <LandingProductOverview />
        <section
          className={`${styles.frame} ${styles.setup}`}
          aria-label="Get started with TraceIQ"
        >
          <ol>
            {steps.map(([title, description], index) => (
              <li key={title}>
                <span className={styles.stepNumber}>0{index + 1}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.frame} ${styles.footerInner}`}>
          <div className={styles.footerCta}>
            <h2>Make complexity legible.</h2>
            <a
              className={`${styles.button} ${styles.whiteButton}`}
              href="/auth/login"
            >
              Explore TraceIQ <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className={styles.footerMiddle}>
            <nav className={styles.footerLinks} aria-label="Footer navigation">
              <div>
                <h3>Product</h3>
                <a href="#product">Overview</a>
                <a href="/pricing">Pricing</a>
                <a href="/status">System status</a>
              </div>
              <div>
                <h3>Resources</h3>
                <a href="/docs">Docs</a>
                <a href="/docs?page=quickstart">SDK setup</a>
                <a href="/blog">Blog</a>
                <a href="https://github.com/enigma-137/trace-iq">GitHub</a>
              </div>
              <div>
                <h3>Company</h3>
                <a href="mailto:traceiq.run@gmail.com">Contact</a>
                <a href="/privacy">Privacy</a>
                <a href="/terms">Terms</a>
              </div>
            </nav>
            <p className={styles.footerNote}>
              Better
              <br />
              information
              <br />
              builds
              <br />
              brighter
              <br />
              products.
            </p>
          </div>
          <a
            className={styles.footerWordmark}
            href="#top"
            aria-label="TraceIQ, back to top"
          >
            TraceIQ
            <span aria-hidden="true" />
          </a>
          <div className={styles.footerBottom}>
            <span>&copy; {new Date().getFullYear()} TraceIQ</span>
            <span>Product analytics and observability, connected.</span>
            <a href="#top">
              Back to top <ArrowUp size={12} aria-hidden="true" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
