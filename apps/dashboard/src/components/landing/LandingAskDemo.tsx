"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import ArrowRight01Icon from "@hugeicons/core-free-icons/ArrowRight01Icon";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import Tick02Icon from "@hugeicons/core-free-icons/Tick02Icon";
import styles from "./landing-ai-demos.module.css";
import { useScriptedPlayback } from "./useScriptedPlayback";

type Claim = { kind: "Observed" | "Correlated" | "Hypothesis"; text: string };

type Conversation = {
  tab: string;
  prompt: string;
  tools: { name: string; args: string; result: string }[];
  chart: { title: string; rows: { label: string; value: number; display: string; hot?: boolean }[] };
  claims: Claim[];
};

const conversations: Conversation[] = [
  {
    tab: "Conversion drop",
    prompt: "Why did checkout conversion drop yesterday?",
    tools: [
      { name: "get_funnel_results", args: "Checkout · 7 days", result: "Pay step 61% → 44%" },
      { name: "get_api_performance", args: "POST /api/pay", result: "p95 2.8 s · 5xx 6.1%" },
      { name: "list_feature_flags", args: "changed this week", result: "checkout-v2 at 50% since Tue" },
    ],
    chart: {
      title: "Reached payment confirmation",
      rows: [
        { label: "checkout-v2 off", value: 63, display: "63%" },
        { label: "checkout-v2 on", value: 41, display: "41%", hot: true },
      ],
    },
    claims: [
      { kind: "Observed", text: "People with checkout-v2 on finished payment 22 points less often." },
      { kind: "Correlated", text: "Their sessions hit 5xx on /api/pay about 4× more." },
      { kind: "Hypothesis", text: "The new flow may be timing out at the payment gateway." },
    ],
  },
  {
    tab: "Top errors",
    prompt: "Which errors hurt the most users this week?",
    tools: [
      { name: "list_error_issues", args: "7 days · by users", result: "14 open issues" },
      { name: "get_error_issue", args: "TypeError in CartSummary", result: "412 users · 3 releases" },
      { name: "get_funnel_step_users", args: "Checkout · dropped", result: "231 overlap" },
    ],
    chart: {
      title: "Users affected",
      rows: [
        { label: "TypeError: reading 'items'", value: 100, display: "412", hot: true },
        { label: "PaymentDeclined", value: 46, display: "188" },
        { label: "ChunkLoadError", value: 23, display: "96" },
      ],
    },
    claims: [
      { kind: "Observed", text: "The CartSummary TypeError hit 412 people, more than the next two combined." },
      { kind: "Correlated", text: "231 of them left checkout within a minute of the error." },
      { kind: "Hypothesis", text: "An empty cart from a stale session may reach a render that expects items." },
    ],
  },
];

// Beats: one per tool call, then the chart, then each claim.
const scripts = conversations.map((conversation) => ({
  prompt: conversation.prompt,
  beats: [700, 1100, 1100, 1000, 700, 700, 700],
}));

export function LandingAskDemo() {
  const playback = useScriptedPlayback(scripts);
  const conversation = conversations[playback.index];
  const toolsShown = Math.min(playback.beat, conversation.tools.length);
  const chartShown = playback.beat > conversation.tools.length;
  const claimsShown = Math.max(0, playback.beat - conversation.tools.length - 1);

  return (
    <div className={styles.askDemo} ref={playback.ref}>
      <div className={styles.askTabs} role="tablist" aria-label="Example questions">
        {conversations.map((item, index) => (
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

      <div className={styles.askBody} aria-live="off">
        <div className={styles.askQuestion}>
          <span className={styles.askWho}>You</span>
          <p>
            {playback.prompt}
            {playback.typing && <span className={styles.caret} aria-hidden="true" />}
          </p>
        </div>

        {playback.beat > 0 && (
          <div className={styles.askAnswer}>
            <span className={`${styles.askWho} ${styles.askBrand}`}>
              Ask TraceIQ
            </span>

            <ul className={styles.toolList}>
              {conversation.tools.slice(0, toolsShown).map((tool, index) => {
                const done = playback.beat > index + 1;
                return (
                  <li key={tool.name} className={styles.reveal}>
                    <span className={done ? styles.toolDone : styles.toolRunning}>
                      {done ? (
                        <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.2} aria-hidden="true" />
                      ) : (
                        <HugeiconsIcon icon={Loading03Icon} size={13} aria-hidden="true" />
                      )}
                    </span>
                    <code>{tool.name}</code>
                    <span className={styles.toolArgs}>{tool.args}</span>
                    {done && <span className={styles.toolResult}>{tool.result}</span>}
                  </li>
                );
              })}
            </ul>

            {chartShown && (
              <div className={`${styles.evidence} ${styles.reveal}`}>
                <h4>{conversation.chart.title}</h4>
                {conversation.chart.rows.map((row) => (
                  <div key={row.label} className={styles.evidenceRow}>
                    <span className={styles.evidenceLabel}>{row.label}</span>
                    <span className={styles.evidenceTrack}>
                      <span
                        className={row.hot ? styles.evidenceBarHot : styles.evidenceBar}
                        style={{ width: `${row.value}%` }}
                      />
                    </span>
                    <strong>{row.display}</strong>
                  </div>
                ))}
              </div>
            )}

            {claimsShown > 0 && (
              <ul className={styles.claims}>
                {conversation.claims.slice(0, claimsShown).map((claim) => (
                  <li key={claim.kind} className={styles.reveal}>
                    <span className={styles[`claim${claim.kind}`]}>{claim.kind}</span>
                    <p>{claim.text}</p>
                  </li>
                ))}
              </ul>
            )}

            {claimsShown === conversation.claims.length && (
              <div className={`${styles.askLinks} ${styles.reveal}`}>
                <span>Open evidence</span>
                <a href="/features/product-analytics">Funnel</a>
                <a href="/features/error-tracking">Errors</a>
                <a href="/features/session-replay">
                  Replays <HugeiconsIcon icon={ArrowRight01Icon} size={12} aria-hidden="true" />
                </a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
