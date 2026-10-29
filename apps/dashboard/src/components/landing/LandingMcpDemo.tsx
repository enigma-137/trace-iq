"use client";

import styles from "./landing-ai-demos.module.css";
import { useScriptedPlayback } from "./useScriptedPlayback";

type Session = {
  prompt: string;
  calls: { tool: string; args: string; result: string }[];
  reply: string;
};

const sessions: Session[] = [
  {
    prompt: "How did the checkout launch land? Alert me if payment errors spike.",
    calls: [
      { tool: "get_analytics_overview", args: 'range: "7d"', result: "18,240 users · 52,910 events · revenue +12%" },
      { tool: "explain_conversion_drop", args: 'funnelId: "checkout"', result: "Biggest drop at Pay: 61% → 44% since Tuesday" },
      {
        tool: "create_alert",
        args: 'name: "Payment errors", eventName: "payment_failed", condition: "spikes_by", threshold: 50',
        result: 'Alert "Payment errors" created',
      },
    ],
    reply:
      "Traffic is up 12%, but fewer people get through payment since Tuesday's rollout. I set an alert for when payment_failed spikes by 50%. Want me to check /api/pay next?",
  },
  {
    prompt: "Turn off checkout-v2 for now and tell me who it affected.",
    calls: [
      { tool: "list_feature_flags", args: "", result: "12 flags · checkout-v2 at 50%, enabled" },
      { tool: "toggle_feature_flag", args: 'flagId: "flag_checkout_v2", enabled: false', result: "checkout-v2 disabled" },
      { tool: "find_users_who_failed_checkout", args: 'funnelId: "checkout"', result: "231 users stalled at Pay, 64% on iOS Safari" },
    ],
    reply:
      "checkout-v2 is off. 231 people stalled at the payment step, mostly on iOS Safari. Their timelines are linked in TraceIQ if you want to watch a few replays.",
  },
];

// Pixel mascot from the Claude Code welcome screen, on an 11 x 7 grid.
const mascot = [
  "..XXXXXXX..",
  "..X.XXX.X..",
  "XXXXXXXXXXX",
  "XXXXXXXXXXX",
  "..XXXXXXX..",
  "..X.X.X.X..",
  "..X.X.X.X..",
];

function ClaudeCodeLogo() {
  return (
    <svg className={styles.terminalLogo} viewBox="0 0 11 7" role="img" aria-label="Claude Code" shapeRendering="crispEdges">
      {mascot.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "X" ? <rect key={`${x}-${y}`} x={x} y={y} width={1.02} height={1.02} fill="currentColor" /> : null,
        ),
      )}
    </svg>
  );
}

// Beats: one per tool call, then the reply.
const scripts = sessions.map((session) => ({
  prompt: session.prompt,
  beats: [900, 1300, 1300, 1300],
}));

export function LandingMcpDemo() {
  const playback = useScriptedPlayback(scripts);
  const session = sessions[playback.index];
  const callsShown = Math.min(playback.beat, session.calls.length);
  const replied = playback.beat > session.calls.length;
  const working = !playback.typing && !replied;

  return (
    <div className={styles.terminal} ref={playback.ref}>
      <div className={styles.terminalBar}>
        <span className={styles.lights} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span>claude — ~/shop-app</span>
        <span className={styles.terminalTag}>Sample session</span>
      </div>

      <div className={styles.terminalBody}>
        <div className={styles.terminalHeader}>
          <ClaudeCodeLogo />
          <div>
            <strong>Claude Code</strong>
            <span>MCP · traceiq connected</span>
            <span>~/shop-app</span>
          </div>
        </div>

        <div className={styles.terminalPrompt}>
          <span aria-hidden="true">&gt;</span>
          <p>
            {playback.prompt}
            {playback.typing && <span className={styles.termCaret} aria-hidden="true" />}
          </p>
        </div>

        <ul className={styles.calls}>
          {session.calls.slice(0, callsShown).map((call, index) => {
            const done = playback.beat > index + 1;
            return (
              <li key={call.tool} className={styles.reveal}>
                <div>
                  <span className={done ? styles.callDone : styles.callRunning} aria-hidden="true">
                    ●
                  </span>
                  <strong>traceiq - {call.tool}</strong> <span className={styles.callMcp}>(MCP)</span>
                  <span className={styles.callArgs}>({call.args})</span>
                </div>
                {done && <p className={styles.callResult}>⎿ {call.result}</p>}
              </li>
            );
          })}
        </ul>

        {replied && <p className={`${styles.reply} ${styles.reveal}`}>● {session.reply}</p>}

        <div className={styles.terminalStatus}>
          {working ? (
            <span className={styles.spinning}>✻ Checking TraceIQ… (esc to interrupt)</span>
          ) : (
            <span>&nbsp;</span>
          )}
        </div>
        <div className={styles.terminalInput}>
          <span aria-hidden="true">&gt;</span>
          <span className={styles.termCaret} aria-hidden="true" />
        </div>
        <p className={styles.terminalHint}>? for shortcuts</p>
      </div>
    </div>
  );
}
