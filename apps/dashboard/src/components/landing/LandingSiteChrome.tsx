"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, ArrowUp, ChevronDown, Menu, X } from "lucide-react";
import { HugeiconsIcon } from "@hugeicons/react";
import styles from "@/app/landing-light.module.css";
import { featureGroups, features } from "./features";

const navigation = [
  ["Docs", "/docs"],
  ["Pricing", "/pricing"],
  ["Blog", "/blog"],
  ["GitHub", "https://github.com/enigma-137/trace-iq"],
] as const;

/** White public-site header and cobalt footer shared by the landing and pricing pages. */
export function LandingSiteChrome({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);
  const featuresRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!featuresOpen) return;
    const close = (event: PointerEvent) => {
      if (!featuresRef.current?.contains(event.target as Node)) setFeaturesOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [featuresOpen]);

  return (
    <div className={styles.site} id="top">
      <a className={styles.skipLink} href="#main-content">
        Skip to content
      </a>
      <header className={styles.header}>
        <div className={`${styles.frame} ${styles.headerInner}`}>
          <a className={styles.wordmark} href="/" aria-label="TraceIQ home">
            TraceIQ<span aria-hidden="true">.</span>
          </a>
          <nav className={styles.desktopNav} aria-label="Primary navigation">
            <div
              className={styles.featuresMenu}
              ref={featuresRef}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  setFeaturesOpen(false);
                  featuresRef.current?.querySelector("button")?.focus();
                }
              }}
            >
              <button
                type="button"
                className={styles.featuresTrigger}
                aria-expanded={featuresOpen}
                aria-controls="features-menu"
                onClick={() => setFeaturesOpen(!featuresOpen)}
              >
                Features <ChevronDown size={13} aria-hidden="true" />
              </button>
              {featuresOpen && (
                <div className={styles.featuresPanel} id="features-menu">
                  {featureGroups.map((group) => (
                    <div key={group} className={styles.featuresColumn}>
                      <h3>{group}</h3>
                      {features
                        .filter((feature) => feature.group === group)
                        .map((feature) => (
                            <a key={feature.slug} href={`/features/${feature.slug}`}>
                              <span className={styles.featureIcon}>
                                <HugeiconsIcon icon={feature.icon} size={19} strokeWidth={1.6} aria-hidden="true" />
                              </span>
                              <span>
                                <strong>
                                  {feature.name}
                                  {feature.status === "soon" && (
                                    <em className={styles.soonBadge}>Soon</em>
                                  )}
                                </strong>
                                <small>{feature.summary}</small>
                              </span>
                            </a>
                        ))}
                    </div>
                  ))}
                  <a className={styles.featuresAll} href="/features">
                    All features <ArrowRight size={12} aria-hidden="true" />
                  </a>
                </div>
              )}
            </div>
            {navigation.map(([label, href]) => (
              <a key={href} href={href}>
                {label}
              </a>
            ))}
          </nav>
          <a
            className={`${styles.button} ${styles.headerCta}`}
            href="/auth/login?mode=signup"
          >
            Get started free <ArrowRight size={14} aria-hidden="true" />
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
            <span className={styles.mobileNavLabel}>Features</span>
            <div className={styles.mobileFeatures}>
              {features.map((feature) => (
                <a
                  key={feature.slug}
                  href={`/features/${feature.slug}`}
                  onClick={() => setMenuOpen(false)}
                >
                  {feature.name}
                </a>
              ))}
            </div>
            {navigation.map(([label, href]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      <footer className={styles.footer}>
        <div className={`${styles.frame} ${styles.footerInner}`}>
          <div className={styles.footerCta}>
            <h2>Make complexity legible.</h2>
            <a
              className={`${styles.button} ${styles.whiteButton}`}
              href="/auth/login?mode=signup"
            >
              Get started free <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
          <div className={styles.footerMiddle}>
            <nav className={styles.footerLinks} aria-label="Footer navigation">
              <div>
                <h3>Product</h3>
                <a href="/#product">Overview</a>
                <a href="/features">Features</a>
                <a href="/features/ask-traceiq">Ask TraceIQ</a>
                <a href="/features/mcp-server">MCP server</a>
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
