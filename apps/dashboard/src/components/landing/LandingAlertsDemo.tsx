"use client";

import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import Mail01Icon from "@hugeicons/core-free-icons/Mail01Icon";
import { SlackLogo, TelegramLogo } from "@/components/BrandLogos";
import styles from "./landing-ai-demos.module.css";
import { useScriptedPlayback } from "./useScriptedPlayback";

type Delivery = {
  channel: "Slack" | "Telegram" | "Email";
  where: string;
  time: string;
  title: string;
  body: string;
};

type Scene = {
  tab: string;
  /** Typed into the rule bar before anything else happens. */
  label: string;
  prompt: string;
  deliveries: Delivery[];
};

const scenes: Scene[] = [
  {
    tab: "Alert",
    label: "When",
    prompt: "checkout_completed falls below 90% in 1 hour",
    deliveries: [
      {
        channel: "Slack",
        where: "#alerts",
        time: "now",
        title: "Checkout completions fired",
        body: "82% over the last hour, under your 90% line. 14 payments failed.",
      },
      {
        channel: "Email",
        where: "team@nuwell.com",
        time: "now",
        title: "Alert: Checkout completions",
        body: "Value 82%, threshold below 90%. Open the alert to see the events.",
      },
    ],
  },
  {
    tab: "Daily brief",
    label: "Every day",
    prompt: "at 08:00 Africa/Lagos, to Telegram and Slack",
    deliveries: [
      {
        channel: "Telegram",
        where: "Nuwell team",
        time: "08:00",
        title: "Nuwell AI Web · your daily brief",
        body: "Signups are up 24% today. 71% came from Nigeria.",
      },
      {
        channel: "Slack",
        where: "#growth",
        time: "08:00",
        title: "Nuwell AI Web · your daily brief",
        body: "Revenue ₦184,000 · 23 paid · 2 failed. Look at this: activity is up 24%.",
      },
    ],
  },
];

// Beats: the rule result, then one per delivery.
const scripts = scenes.map((scene) => ({ prompt: scene.prompt, beats: [900, 1000, 900] }));

// A steady line, then the same line with a drop that crosses the threshold.
const STEADY = "M0 22 L30 20 L60 23 L90 19 L120 21 L150 20 L180 22 L210 21";
const DROP = "M0 22 L30 20 L60 23 L90 19 L120 21 L150 44 L180 62 L210 70";
const THRESHOLD_Y = 44;

function Channel({ delivery }: { delivery: Delivery }) {
  const logo: ReactNode =
    delivery.channel === "Slack" ? (
      <SlackLogo size={18} />
    ) : delivery.channel === "Telegram" ? (
      <TelegramLogo size={18} />
    ) : (
      <span className={styles.mailLogo}>
        <HugeiconsIcon icon={Mail01Icon} size={13} strokeWidth={2} aria-hidden="true" />
      </span>
    );

  return (
    <li className={`${styles.delivery} ${styles.reveal}`}>
      <span className={styles.deliveryLogo}>{logo}</span>
      <div className={styles.deliveryText}>
        <p className={styles.deliveryHead}>
          <strong>{delivery.channel}</strong>
          <span>{delivery.where}</span>
          <time>{delivery.time}</time>
        </p>
        <p className={styles.deliveryTitle}>{delivery.title}</p>
        <p className={styles.deliveryBody}>{delivery.body}</p>
      </div>
    </li>
  );
}

function AlertPanel({ firing }: { firing: boolean }) {
  return (
    <div className={styles.alertPanel}>
      <div className={styles.alertStatus}>
        <span className={firing ? styles.statusFiring : styles.statusWatching}>
          <i aria-hidden="true" />
          {firing ? "Firing" : "Watching"}
        </span>
        <span className={styles.alertValue}>{firing ? "82%" : "96%"}</span>
      </div>
      <svg viewBox="0 0 210 80" className={styles.alertChart} role="img" aria-label="Checkout completions over the last hour">
        <line x1="0" x2="210" y1={THRESHOLD_Y} y2={THRESHOLD_Y} className={styles.thresholdLine} />
        <text x="2" y={THRESHOLD_Y - 4} className={styles.thresholdLabel}>
          90%
        </text>
        {/* Re-keying on `firing` replays the draw animation when the drop appears. */}
        <path key={firing ? "drop" : "steady"} d={firing ? DROP : STEADY} className={firing ? styles.lineFiring : styles.lineSteady} pathLength={1} />
      </svg>
    </div>
  );
}

function BriefPanel({ built }: { built: boolean }) {
  return (
    <div className={styles.alertPanel}>
      <div className={styles.alertStatus}>
        <span className={built ? styles.statusReady : styles.statusWatching}>
          <i aria-hidden="true" />
          {built ? "Brief ready" : "Waiting for 08:00"}
        </span>
        <span className={styles.alertValue}>{built ? "08:00" : "07:59"}</span>
      </div>
      <div className={styles.briefStats}>
        {[
          ["Events", "1,320"],
          ["Visitors", "412"],
          ["Revenue", "₦184k"],
        ].map(([label, value]) => (
          <div key={label} className={built ? styles.reveal : styles.briefStatIdle}>
            <span>{label}</span>
            <strong>{built ? value : "–"}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Animated demo: an alert firing into Slack and email, then the daily brief landing in Telegram and Slack. */
export function LandingAlertsDemo() {
  const playback = useScriptedPlayback(scripts);
  const scene = scenes[playback.index];
  const resultShown = playback.beat >= 1;
  const deliveriesShown = Math.max(0, playback.beat - 1);

  return (
    <div className={styles.askDemo} ref={playback.ref}>
      <div className={styles.askTabs} role="tablist" aria-label="Alert examples">
        {scenes.map((item, index) => (
          <button
            key={item.tab}
            type="button"
            role="tab"
            aria-selected={playback.index === index}
            onClick={() => playback.select(index)}
          >
            {item.tab}
          </button>
        ))}
        <span className={styles.sampleTag}>Sample data</span>
      </div>

      <div className={`${styles.askBody} ${styles.alertBody}`} aria-live="off">
        <div className={styles.askQuestion}>
          <span className={styles.askWho}>{scene.label}</span>
          <p>
            {playback.prompt}
            {playback.typing && <span className={styles.caret} aria-hidden="true" />}
          </p>
        </div>

        {playback.index === 0 ? <AlertPanel firing={resultShown} /> : <BriefPanel built={resultShown} />}

        <ul className={styles.deliveries} aria-label="Delivered to">
          {scene.deliveries.slice(0, deliveriesShown).map((delivery) => (
            <Channel key={`${scene.tab}-${delivery.channel}`} delivery={delivery} />
          ))}
        </ul>
      </div>
    </div>
  );
}
