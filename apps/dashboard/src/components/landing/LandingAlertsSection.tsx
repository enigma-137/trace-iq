import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import { LandingAlertsDemo } from "./LandingAlertsDemo";
import styles from "./landing-ai-demos.module.css";

export function AlertsCopy() {
  return (
    <div className={styles.aiCopy}>
      <p className={styles.eyebrow}>Alerts</p>
      <h2>
        Know before your users <mark>tell you.</mark>
      </h2>
      <p>
        Watch any event, error or revenue number. When it crosses your line, the message lands in Slack or your
        inbox. Every morning, a short brief tells you what changed and what to look at.
      </p>
      <ul className={styles.aiPoints}>
        <li>Alert on event counts, unique users or a property average over a rolling window.</li>
        <li>Send alerts by email or to any webhook, including a Slack channel.</li>
        <li>Get a daily brief in Slack or Telegram. Quiet days send nothing.</li>
      </ul>
      <div className={styles.aiActions}>
        <a className={landing.button} href="/auth/login?mode=signup">
          Set up alerts <ArrowRight size={15} aria-hidden="true" />
        </a>
        <a className={styles.textLink} href="/docs?page=alerts">
          How alerts work <ArrowRight size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Landing-page band that sits before Ask TraceIQ: alerts and the daily brief, with Slack and Telegram. */
export function LandingAlertsSection() {
  return (
    <section className={`${landing.frame} ${styles.aiSection}`} aria-label="Alerts and daily brief">
      <div className={styles.aiBlock}>
        <AlertsCopy />
        <LandingAlertsDemo />
      </div>
    </section>
  );
}
