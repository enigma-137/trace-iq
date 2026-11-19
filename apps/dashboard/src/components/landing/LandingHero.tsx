import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import styles from "@/app/landing-light.module.css";


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
          Know why users <span>drop off.</span>
        </h1>
        <p className={styles.heroLead}>
          TraceIQ puts what users do and what breaks for them on one timeline,
          so you can trace any drop to the exact click and error behind it.
        </p>
        <div className={styles.heroActions}>
          <a className={styles.button} href="/auth/login?mode=signup">
            Get started free <ArrowRight size={16} aria-hidden="true" />
          </a>
          <Link className={`${styles.heroSecondary} ${styles.heroDemo}`} href="/demo">
            <span className={styles.liveDot} aria-hidden="true" />
            Live demo
          </Link>
        </div>
        <p className={styles.heroNote}>
          Free up to 50,000 events a month, or self-host with no limits.
        </p>
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
