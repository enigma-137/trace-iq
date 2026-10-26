import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import styles from "./landing-signal-path.module.css";

const beats = [
  {
    title: "Capture",
    text: "The SDK records the tap with its session, user and screen.",
  },
  {
    title: "Correlate",
    text: "Trace context rides along every request that tap sets off.",
  },
  {
    title: "Explain",
    text: "The error lands on the same timeline, next to everything that led to it.",
  },
];

// Journey nodes in the 600 x 120 coordinate space of the curve above the waterfall.
const journey = [
  { label: "Tap", x: 40, y: 78 },
  { label: "Request", x: 170, y: 42 },
  { label: "Trace", x: 300, y: 70 },
  { label: "Error", x: 430, y: 36, error: true },
  { label: "Insight", x: 560, y: 60 },
];

// Catmull-Rom through the nodes, emitted as cubic Béziers.
function smoothPath(points: { x: number; y: number }[]) {
  let d = `M${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x} ${p2.y}`;
  }
  return d;
}

const journeyPath = smoothPath(journey);

// Spans as start/width percentages of a 1.4 s window.
const spans = [
  { name: "tap checkout_pay", start: 0, width: 3, depth: 0 },
  { name: "POST /api/payments", start: 3, width: 82, depth: 0 },
  { name: "db.query orders", start: 8, width: 22, depth: 1 },
  { name: "stripe.charge", start: 32, width: 50, depth: 1 },
  { name: "PaymentDeclined", start: 82, width: 3, depth: 2, error: true },
  { name: "render ErrorBanner", start: 86, width: 10, depth: 0 },
];
const ERROR_AT = 83.5;

const HALFTONE_COLS = 64;
const HALFTONE_ROWS = 7;
const HALFTONE_CELL = 10;

type Dot = { cx: number; cy: number; r: number; hot: boolean };

// Halftone strip: dots swell toward the bottom edge and around the moment of the error.
function buildHalftone(): Dot[] {
  const dots: Dot[] = [];
  const errorU = ERROR_AT / 100;
  for (let col = 0; col < HALFTONE_COLS; col++) {
    const u = (col + 0.5) / HALFTONE_COLS;
    const swell = Math.exp(-(((u - errorU) / 0.12) ** 2));
    for (let row = 0; row < HALFTONE_ROWS; row++) {
      const depth = (row + 1) / HALFTONE_ROWS; // 1 at the bottom
      const intensity = depth * (0.35 + 0.65 * swell);
      const r = 4.4 * intensity;
      if (r < 0.7) continue;
      dots.push({
        cx: col * HALFTONE_CELL + HALFTONE_CELL / 2,
        cy: row * HALFTONE_CELL + HALFTONE_CELL / 2,
        r: Number(r.toFixed(2)),
        hot: swell > 0.45 && depth > 0.4,
      });
    }
  }
  return dots;
}

const halftone = buildHalftone();

// Real figures from one production app tracked on TraceIQ (30 days to Oct 26, 2026).
const PROBLEM_SOURCE = "One production app on TraceIQ · last 30 days";

const supportingStats = [
  { value: "791,668", label: "Events captured" },
  { value: "4.8 s", label: "p95 latency", note: "Median 465 ms" },
  { value: "8,073", label: "Sessions", note: "2,345 identified profiles" },
];

function Radar() {
  const rings = [44, 88, 132, 176, 220];
  // A few events sitting on the rings; the blue one is the request that failed.
  const blips = [
    { ring: 1, angle: 210 },
    { ring: 2, angle: 320 },
    { ring: 3, angle: 140 },
    { ring: 3, angle: 20 },
    { ring: 4, angle: 250 },
    { ring: 4, angle: 95 },
  ];
  const target = { ring: 2, angle: 48 };
  const at = (ring: number, angle: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: 240 + rings[ring] * Math.cos(rad),
      y: 240 + rings[ring] * Math.sin(rad),
    };
  };
  const hit = at(target.ring, target.angle);

  return (
    <svg className={styles.radar} viewBox="0 0 480 480" aria-hidden="true">
      {rings.map((r) => (
        <circle key={r} cx="240" cy="240" r={r} className={styles.ring} />
      ))}
      <path d="M240 10V470M10 240H470" className={styles.axis} />
      <path
        d={`M240 240L${(240 + 220 * Math.cos(-0.5)).toFixed(1)} ${(240 + 220 * Math.sin(-0.5)).toFixed(1)}A220 220 0 0 1 460 240Z`}
        className={styles.sweep}
      />
      {blips.map((blip) => {
        const p = at(blip.ring, blip.angle);
        return (
          <circle
            key={`${blip.ring}-${blip.angle}`}
            cx={p.x.toFixed(1)}
            cy={p.y.toFixed(1)}
            r="5"
            className={styles.blip}
          />
        );
      })}
      <circle
        cx={hit.x.toFixed(1)}
        cy={hit.y.toFixed(1)}
        r="22"
        className={styles.hitHalo}
      />
      <circle
        cx={hit.x.toFixed(1)}
        cy={hit.y.toFixed(1)}
        r="9"
        className={styles.hit}
      />
    </svg>
  );
}

export function LandingSignalPath() {
  return (
    <>
      <section
        className={`${landing.frame} ${styles.path}`}
        aria-labelledby="signal-path-heading"
      >
        <div className={styles.pathLayout}>
          <div className={styles.pathIntro}>
            <h2 id="signal-path-heading">
              One tap.
              <br />
              <span>One timeline.</span>
            </h2>
            <ol className={styles.beats}>
              {beats.map((beat, index) => (
                <li key={beat.title}>
                  <span className={styles.beatDot} aria-hidden="true">
                    {index + 1}
                  </span>
                  <div>
                    <h3>{beat.title}</h3>
                    <p>{beat.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <figure className={styles.traceCard}>
            <div className={styles.traceHead}>
              <span>
                <i aria-hidden="true" /> Checkout failed
              </span>
              <span>session s_7f9c2e6a</span>
            </div>

            <div className={styles.journey}>
              <svg
                viewBox="0 0 600 120"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d={journeyPath} className={styles.journeyLine} />
              </svg>
              {journey.map((node, index) => (
                <span
                  key={node.label}
                  className={styles.journeyNode}
                  data-error={node.error || undefined}
                  style={
                    {
                      "--x": `${(node.x / 600) * 100}%`,
                      "--y": `${(node.y / 120) * 100}%`,
                      "--step": index,
                    } as CSSProperties
                  }
                >
                  <b aria-hidden="true" />
                  <small>{node.label}</small>
                </span>
              ))}
            </div>

            <div
              className={styles.waterfall}
              style={{ "--error-at": ERROR_AT / 100 } as CSSProperties}
            >
              {spans.map((span) => (
                <div key={span.name} className={styles.span}>
                  <span
                    className={styles.spanName}
                    style={{ "--depth": span.depth } as CSSProperties}
                  >
                    {span.name}
                  </span>
                  <span className={styles.spanTrack}>
                    <span
                      className={styles.spanBar}
                      data-error={span.error || undefined}
                      style={
                        {
                          left: `${span.start}%`,
                          width: `${span.width}%`,
                        } as CSSProperties
                      }
                    />
                  </span>
                </div>
              ))}
              <span className={styles.cursor} aria-hidden="true">
                <small>+1.2 s</small>
              </span>
            </div>

            <svg
              className={styles.halftone}
              viewBox={`0 0 ${HALFTONE_COLS * HALFTONE_CELL} ${HALFTONE_ROWS * HALFTONE_CELL}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {halftone.map((dot) => (
                <circle
                  key={`${dot.cx}-${dot.cy}`}
                  cx={dot.cx}
                  cy={dot.cy}
                  r={dot.r}
                  className={dot.hot ? styles.dotHot : styles.dot}
                />
              ))}
            </svg>
            <figcaption>Illustrative trace</figcaption>
          </figure>
        </div>
      </section>

      <section
        className={`${landing.frame} ${styles.problem}`}
        aria-labelledby="problem-heading"
      >
        <Radar />
        <div className={styles.problemInner}>
          <span className={styles.tag}>The problem</span>
          <h2 id="problem-heading">Bugs don&rsquo;t announce themselves.</h2>
          <p className={styles.source}>{PROBLEM_SOURCE}</p>

          <div className={styles.headline}>
            <strong>9,642</strong>
            <div>
              <p className={styles.headlineLabel}>failed requests</p>
              <p>
                1.35% of 712,518 API calls. Each one is a user who hit a wall
                and probably didn&rsquo;t tell you.
              </p>
            </div>
          </div>

          <dl className={styles.ruler}>
            {supportingStats.map((stat) => (
              <div key={stat.label}>
                <dt>{stat.label}</dt>
                <dd>
                  {stat.value}
                  {stat.note ? <small>{stat.note}</small> : null}
                </dd>
              </div>
            ))}
          </dl>

          <div className={styles.cta}>
            <div>
              <span className={styles.ctaKicker}>With TraceIQ</span>
              <h3>
                From the tap to the failing line, <span>on one screen.</span>
              </h3>
            </div>
            <a className={styles.ctaButton} href="/auth/login">
              Start tracing <ArrowRight size={16} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
