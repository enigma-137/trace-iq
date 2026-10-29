import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "@/app/landing-light.module.css";

const features = [
  { label: "Product analytics", href: "/docs?page=insights" },
  { label: "Session replay", href: "/docs?page=session-replay" },
  { label: "Error tracking", href: "/docs?page=source-maps" },
  { label: "API performance", href: "/docs?page=api-performance" },
  { label: "Logs", href: "/docs?page=logs" },
  { label: "Feature flags", href: "/docs?page=flags" },
  { label: "Experiments", href: "/docs?page=experiments" },
  { label: "Surveys", href: "/docs?page=surveys" },
  { label: "Synthetic monitors", href: "/docs?page=synthetic-monitors" },
];

export function LandingHero() {
  return (
    <section
      className={`${styles.frame} ${styles.hero}`}
      aria-labelledby="hero-heading"
    >
      <div className={styles.heroCopy}>
        <p className={styles.heroEyebrow}>
          Open-source product analytics &amp; monitoring
        </p>
        <h1 id="hero-heading">
          See what users do, <span>and what broke when they couldn&rsquo;t.</span>
        </h1>
        <p className={styles.heroLead}>
          Track events, funnels and retention. Replay sessions. Catch errors and
          slow APIs. Ship with feature flags and A/B tests. All tied to the same
          user timeline, so you can go from a drop in signups to the exact click
          and stack trace that caused it.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.button} href="/auth/login?mode=signup">
            Get started free <ArrowRight size={16} aria-hidden="true" />
          </a>
          <Link className={`${styles.heroSecondary} ${styles.heroDemo}`} href="/demo">
            <span className={styles.liveDot} aria-hidden="true" />
            Live demo
          </Link>
          <Link className={styles.heroSecondary} href="/docs">
            Read the docs
          </Link>
        </div>
        <p className={styles.heroNote}>
          Free up to 50,000 events a month, or self-host with no limits.
        </p>
        <ul className={styles.heroFeatures} aria-label="What TraceIQ does">
          {features.map((feature) => (
            <li key={feature.label}>
              <Link href={feature.href}>{feature.label}</Link>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.heroVisual}>
        <Image
          src="/landing/traceiq-signal-field.webp"
          alt=""
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1280px"
          unoptimized
          className={styles.heroImage}
        />
        <div className={styles.signalLabels} aria-hidden="true">
          <span>Event</span>
          <span>Error</span>
          <span>Insight</span>
        </div>
        <span className={styles.heroIndex} aria-hidden="true">
          01 / From noise to knowledge
        </span>
      </div>
    </section>
  );
}
