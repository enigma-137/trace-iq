import type { CSSProperties } from "react";
import { ArrowRight } from "lucide-react";
import landing from "@/app/landing-light.module.css";
import styles from "./landing-signal-path.module.css";

type PathNode = {
  label: string;
  timing: string;
  col: number;
  row: number;
  tone?: "blue" | "orange";
};

// Grid positions are 1-based columns/rows of a 12 x 4 diagram.
const pathNodes: PathNode[] = [
  { label: "Click", timing: "0 ms", col: 2, row: 2, tone: "blue" },
  { label: "Request", timing: "+38 ms", col: 4, row: 1 },
  { label: "Trace", timing: "+412 ms", col: 6, row: 3, tone: "blue" },
  { label: "Error", timing: "+1.2 s", col: 8, row: 2, tone: "orange" },
  { label: "Insight", timing: "+1.3 s", col: 10, row: 3 },
];

// Real figures from one production app tracked on TraceIQ (30 days to Oct 26, 2026).
const PROBLEM_SOURCE = "One production app on TraceIQ \u00b7 last 30 days";

const problems = [
  {
    value: "791,668",
    title: "Events captured",
    text: "Every tap, request and error, already on record.",
  },
  {
    value: "9,642",
    title: "Failed requests",
    text: "1.35% of 712,518 API calls. Each one is a user who hit a wall.",
    accent: true,
  },
  {
    value: "4.8 s",
    title: "p95 latency",
    text: "The median is 465 ms. Users feel the slow tail, not the average.",
  },
  {
    value: "8,073",
    title: "Sessions",
    text: "Across 2,345 identified profiles, each one a story to follow.",
  },
];

// Deterministic PRNG so the server and client render the same texture.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIELD_COLS = 180;
const FIELD_ROWS = 26;
const CELL = 6;

type Pixel = {
  x: number;
  y: number;
  fill: "blue" | "orange" | "green" | "ink";
};

// A dithered mound of pixels: dense and orange at the centre, scattering into blue at the edges.
function buildSignalField(): Pixel[] {
  const random = mulberry32(137);
  const pixels: Pixel[] = [];
  for (let col = 0; col < FIELD_COLS; col++) {
    const u = col / (FIELD_COLS - 1);
    const mound = Math.exp(-(((u - 0.5) / 0.24) ** 2));
    for (let row = 0; row < FIELD_ROWS; row++) {
      const height = row / FIELD_ROWS; // 0 at the bottom
      const density = mound * 1.15 - height;
      const roll = random();
      if (roll > density + 0.08) continue;
      if (row < 3 && Math.abs(u - 0.5) < 0.16) {
        pixels.push({
          x: col * CELL,
          y: (FIELD_ROWS - 1 - row) * CELL,
          fill: "orange",
        });
        continue;
      }
      // Leave a one-pixel gutter on alternate cells away from the core for a checkerboard dither.
      if (density < 0.45 && (col + row) % 2 === 1) continue;
      const pick = random();
      const fill =
        density > 0.55
          ? pick < 0.92
            ? "orange"
            : "ink"
          : pick < 0.7
            ? "blue"
            : pick < 0.94
              ? "green"
              : "ink";
      pixels.push({ x: col * CELL, y: (FIELD_ROWS - 1 - row) * CELL, fill });
    }
  }
  return pixels;
}

const signalField = buildSignalField();

const ISO_COS = Math.cos(Math.PI / 6);
const ISO_SIN = 0.5;

function iso(
  x: number,
  y: number,
  z: number,
  unit: number,
  originX: number,
  originY: number,
) {
  return [
    originX + (x - y) * ISO_COS * unit,
    originY + (x + y) * ISO_SIN * unit - z * unit,
  ] as const;
}

function polygon(points: ReadonlyArray<readonly [number, number]>) {
  return points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
}

type Cube = {
  x: number;
  y: number;
  size: number;
  tone: "outline" | "accent" | "chain";
};

// Corner cubes, chains of small "spans" feeding the centre, and one highlighted event.
const cubes: Cube[] = [
  { x: 0, y: 0, size: 2, tone: "outline" },
  { x: 8, y: 0, size: 2, tone: "outline" },
  { x: 0, y: 8, size: 2, tone: "outline" },
  { x: 8, y: 8, size: 2, tone: "outline" },
  ...[2.6, 3.2, 3.8].map((x) => ({
    x,
    y: 1,
    size: 0.5,
    tone: "chain" as const,
  })),
  ...[2.6, 3.2, 3.8].map((y) => ({
    x: 1,
    y,
    size: 0.5,
    tone: "chain" as const,
  })),
  ...[6.2, 6.8, 7.4].map((x) => ({
    x,
    y: 9,
    size: 0.5,
    tone: "chain" as const,
  })),
  ...[6.2, 6.8, 7.4].map((y) => ({
    x: 9,
    y,
    size: 0.5,
    tone: "chain" as const,
  })),
  { x: 4.5, y: 4.5, size: 1.2, tone: "accent" },
];

function IsoField() {
  const unit = 22;
  const width = 480;
  const height = 330;
  const ox = width / 2;
  const oy = 70;
  const gridLines: string[] = [];
  for (let i = -4; i <= 14; i++) {
    const [ax, ay] = iso(i, -4, 0, unit, ox, oy);
    const [bx, by] = iso(i, 14, 0, unit, ox, oy);
    const [cx, cy] = iso(-4, i, 0, unit, ox, oy);
    const [dx, dy] = iso(14, i, 0, unit, ox, oy);
    gridLines.push(
      `M${ax.toFixed(1)} ${ay.toFixed(1)}L${bx.toFixed(1)} ${by.toFixed(1)}`,
    );
    gridLines.push(
      `M${cx.toFixed(1)} ${cy.toFixed(1)}L${dx.toFixed(1)} ${dy.toFixed(1)}`,
    );
  }
  // Paint back to front so nearer cubes overlap farther ones.
  const ordered = [...cubes].sort((a, b) => a.x + a.y - (b.x + b.y));

  return (
    <svg
      className={styles.isoField}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <path d={gridLines.join("")} className={styles.isoGrid} />
      {ordered.map((cube, index) => {
        const { x, y, size: s } = cube;
        const p = (dx: number, dy: number, dz: number) =>
          iso(x + dx, y + dy, dz, unit, ox, oy);
        const top = [p(0, 0, s), p(s, 0, s), p(s, s, s), p(0, s, s)];
        const left = [p(0, s, 0), p(s, s, 0), p(s, s, s), p(0, s, s)];
        const right = [p(s, 0, 0), p(s, s, 0), p(s, s, s), p(s, 0, s)];
        return (
          <g key={index} className={styles[`cube_${cube.tone}`]}>
            <polygon points={polygon(left)} className={styles.cubeLeft} />
            <polygon points={polygon(right)} className={styles.cubeRight} />
            <polygon points={polygon(top)} className={styles.cubeTop} />
          </g>
        );
      })}
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
        <div className={styles.pathHeader}>
          <span className={styles.index}>02 / Signal path</span>
          <h2 id="signal-path-heading">
            One click.
            <br />
            <span>One timeline.</span>
          </h2>
          <p>
            Every event TraceIQ captures carries its context forward, so a tap
            in the UI, the request it fired and the error it hit land on the
            same thread.
          </p>
        </div>

        <div
          className={styles.diagram}
          role="img"
          aria-label="An event travelling from a click, to a request, a trace, an error and an insight"
        >
          {pathNodes.map((node, index) => (
            <div
              key={node.label}
              className={styles.node}
              data-tone={node.tone}
              style={
                {
                  "--col": node.col,
                  "--row": node.row,
                  "--step": index,
                } as CSSProperties
              }
            >
              <span className={styles.lead} aria-hidden="true">
                <small>{node.timing}</small>
              </span>
              <span className={styles.chip}>
                <i aria-hidden="true" />
                {node.label}
              </span>
            </div>
          ))}
          <span className={styles.counter} aria-hidden="true">
            Session <b>s_7f9c2e6a</b>
          </span>
          <svg
            className={styles.field}
            viewBox={`0 0 ${FIELD_COLS * CELL} ${FIELD_ROWS * CELL}`}
            preserveAspectRatio="xMidYMax slice"
            aria-hidden="true"
          >
            {signalField.map((pixel) => (
              <rect
                key={`${pixel.x}-${pixel.y}`}
                x={pixel.x}
                y={pixel.y}
                width={CELL - 1}
                height={CELL - 1}
                className={styles[`px_${pixel.fill}`]}
              />
            ))}
          </svg>
        </div>
        <p className={styles.caption}>Illustrative timings</p>
      </section>

      <section
        className={`${landing.frame} ${styles.problem}`}
        aria-labelledby="problem-heading"
      >
        <span className={styles.index}>03 / The problem</span>
        <span className={styles.tag}>The problem</span>
        <h2 id="problem-heading">Bugs don&rsquo;t announce themselves.</h2>
        <p className={styles.source}>{PROBLEM_SOURCE}</p>

        <div className={styles.problemGrid}>
          {problems.map((item) => (
            <div key={item.title} className={styles.stat}>
              <span
                className={styles.statValue}
                data-accent={item.accent || undefined}
              >
                {item.value}
              </span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </div>
          ))}
          <div className={styles.answer}>
            <div className={styles.answerCopy}>
              <span className={styles.tagPlain}>With TraceIQ</span>
              <h3>
                From the click to the failing line, <span>on one screen.</span>
              </h3>
              <a className={styles.answerCta} href="/auth/login">
                Start tracing <ArrowRight size={16} aria-hidden="true" />
              </a>
            </div>
            <IsoField />
          </div>
        </div>
      </section>
    </>
  );
}
