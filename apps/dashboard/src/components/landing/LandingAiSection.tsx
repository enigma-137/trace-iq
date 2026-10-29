import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import { LandingAskDemo } from "./LandingAskDemo";
import { LandingMcpDemo } from "./LandingMcpDemo";
import styles from "./landing-ai-demos.module.css";

export function AskCopy() {
  return (
    <div className={styles.aiCopy}>
      <p className={styles.eyebrow}>Ask TraceIQ</p>
      <h2>
        Ask a question. <mark>Check the evidence</mark> behind the answer.
      </h2>
      <p>
        The built-in analyst runs read-only tools across funnels, errors, flags and APIs, then tells you
        which parts it saw, which only lined up, and which are still a guess.
      </p>
      <ul className={styles.aiPoints}>
        <li>Every answer lists the tools it ran and what each returned.</li>
        <li>Claims are labelled Observed, Correlated or Hypothesis.</li>
        <li>Evidence links straight to the funnel, error or replay.</li>
      </ul>
      <div className={styles.aiActions}>
        <a className={landing.button} href="/auth/login?mode=signup">
          Try Ask TraceIQ <ArrowRight size={15} aria-hidden="true" />
        </a>
        <a className={styles.textLink} href="/features/ask-traceiq">
          How it works <ArrowRight size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

export function McpCopy() {
  return (
    <div className={styles.aiCopy}>
      <p className={styles.eyebrow}>MCP server</p>
      <h2>
        Check your numbers <mark>without leaving your editor.</mark>
      </h2>
      <p>
        Connect Claude Code, Cursor, Codex or any MCP client with a personal access token. Your agent can pull
        traffic and errors, explain a conversion drop, and set up funnels, alerts and flags for you.
      </p>
      <div className={styles.aiActions}>
        <a className={landing.button} href="/docs?page=mcp">
          Set up MCP <ArrowRight size={15} aria-hidden="true" />
        </a>
        <a className={styles.textLink} href="/features/mcp-server">
          See every tool <ArrowRight size={12} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}

/** Landing-page band: the Ask TraceIQ chat demo, then the Claude Code + MCP terminal demo. */
export function LandingAiSection() {
  return (
    <section className={`${landing.frame} ${styles.aiSection}`} aria-label="AI analysis">
      <div className={styles.aiBlock}>
        <AskCopy />
        <LandingAskDemo />
      </div>
      <div className={`${styles.aiBlock} ${styles.aiBlockFlip}`}>
        <McpCopy />
        <LandingMcpDemo />
      </div>
    </section>
  );
}
