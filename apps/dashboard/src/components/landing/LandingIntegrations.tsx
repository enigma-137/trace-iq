"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import { SlackLogo, TelegramLogo } from "@/components/BrandLogos";
import { GitHubIcon, LinearIcon } from "@/components/ProviderIcons";
import ai from "./landing-ai-demos.module.css";
import styles from "./landing-integrations.module.css";

/** Runs the looping animations only while the section is on screen. */
function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, inView] as const;
}

function GitHubScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.ghError}>
        <span className={styles.ghDot} />
        <code>TypeError: reading &apos;items&apos;</code>
      </div>
      <div className={`${styles.ghSource} ${styles.step1}`}>
        <span>at</span> <code>src/cart/CartSummary.tsx:42</code>
      </div>
      <div className={`${styles.ghPr} ${styles.step2}`}>
        <span className={styles.ghPrIcon}>⑂</span> PR #128 · Add TraceIQ setup
        <em>Open</em>
      </div>
    </div>
  );
}

function LinearScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.lnIssue}>
        <span className={styles.lnId}>ENG-412</span>
        <p>CartSummary crashes on empty cart</p>
        <div className={styles.lnStatus}>
          <span className={styles.lnRing} />
          <span className={styles.lnLabels}>
            <span>Todo</span>
            <span>In Progress</span>
            <span>Done</span>
          </span>
        </div>
      </div>
      <div className={`${styles.lnSync} ${styles.step2}`}>
        <span>⇄</span> Error marked resolved in TraceIQ
      </div>
    </div>
  );
}

function SlackScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={styles.chatHead}># product-health</div>
      <div className={styles.slTyping}>
        <i />
        <i />
        <i />
      </div>
      <div className={styles.slMessage}>
        <strong>TraceIQ</strong>
        <span className={styles.slApp}>APP</span>
        <p>Daily brief: signups +9%, checkout 44% (↓17 pts), 1 new error.</p>
      </div>
    </div>
  );
}

function TelegramScene() {
  return (
    <div className={styles.scene} aria-hidden="true">
      <div className={`${styles.tgBubble} ${styles.tgOut} ${styles.step1}`}>How many signups today?</div>
      <div className={`${styles.tgBubble} ${styles.tgIn} ${styles.step2}`}>214 so far, up 9% on last Tuesday.</div>
      <span className={styles.tgPlane}>
        <TelegramLogo size={24} />
      </span>
    </div>
  );
}

const integrations = [
  {
    key: "github",
    name: "GitHub",
    logo: <GitHubIcon className={styles.githubMark} />,
    text: "Errors link to the exact line in your repo, and setup arrives as a one-click pull request.",
    scene: <GitHubScene />,
  },
  {
    key: "linear",
    name: "Linear",
    logo: <LinearIcon className={styles.linearMark} />,
    text: "Turn an error into a Linear issue. Status stays in sync both ways.",
    scene: <LinearScene />,
  },
  {
    key: "slack",
    name: "Slack",
    logo: <SlackLogo size={30} />,
    text: "Alerts and the daily brief land in the channel you pick.",
    scene: <SlackScene />,
  },
  {
    key: "telegram",
    name: "Telegram",
    logo: <TelegramLogo size={30} />,
    text: "Get the daily brief in a chat, and ask the bot about your numbers.",
    scene: <TelegramScene />,
  },
] as const;

/** Landing-page band: the four tools TraceIQ connects to, each with its own small animated scene. */
export function LandingIntegrations() {
  const [ref, inView] = useInView<HTMLElement>();

  return (
    <section
      ref={ref}
      className={`${landing.frame} ${ai.aiSection} ${styles.section}`}
      data-playing={inView}
      aria-label="Integrations"
    >
      <div className={styles.head}>
        <div className={ai.aiCopy}>
          <p className={ai.eyebrow}>Integrations</p>
          <h2>
            Works with the tools <mark>your team lives in.</mark>
          </h2>
          <p>
            Connect once from Settings. Errors, alerts and the daily brief show up where you already work, with a
            link back to the evidence in TraceIQ.
          </p>
        </div>
        <a className={ai.textLink} href="/auth/login?mode=signup">
          Connect your tools <ArrowRight size={12} aria-hidden="true" />
        </a>
      </div>

      <ul className={styles.grid}>
        {integrations.map((item) => (
          <li key={item.key} className={`${styles.card} ${styles[item.key]}`}>
            <div className={styles.cardTop}>
              <span className={styles.logoTile}>{item.logo}</span>
              <span className={styles.connected}>
                <i /> Connected
              </span>
            </div>
            <h3>{item.name}</h3>
            <p>{item.text}</p>
            {item.scene}
          </li>
        ))}
      </ul>
    </section>
  );
}
