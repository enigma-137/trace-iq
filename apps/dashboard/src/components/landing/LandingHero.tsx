import Image from "next/image";
import { ArrowRight } from "lucide-react";
import styles from "@/app/landing-light.module.css";

export function LandingHero() {
  return (
    <section
      className={`${styles.frame} ${styles.hero}`}
      aria-labelledby="hero-heading"
    >
      <Image
        src="/landing/traceiq-signal-field.webp"
        alt=""
        fill
        priority
        sizes="(max-width: 1280px) 100vw, 1280px"
        unoptimized
        className={styles.heroImage}
      />
      <div className={styles.heroMarginalia} aria-hidden="true">
        <span>
          User activity
          <br />
          in real time
          <br />
          &mdash;
        </span>
        <span>
          Events
          <br />
          Traces
          <br />
          Errors
          <br />
          Insights
          <br />
          &mdash;
        </span>
      </div>
      <div className={styles.heroCopy}>
        <h1 id="hero-heading">
          Find the signal.
          <br />
          <span>Follow the story.</span>
        </h1>
        <p>Product analytics and observability, connected.</p>
        <a className={styles.button} href="/auth/login">
          Explore TraceIQ <ArrowRight size={16} aria-hidden="true" />
        </a>
      </div>
      <div className={styles.signalLabels} aria-hidden="true">
        <span>Event</span>
        <span>Error</span>
        <span>Insight</span>
      </div>
      <span className={styles.heroIndex} aria-hidden="true">
        01 / From noise to knowledge
      </span>
    </section>
  );
}
