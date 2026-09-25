'use client';

import { useEffect, useRef } from 'react';

/**
 * The fixed chrome that sits over the whole landing page: hairline column
 * rules, edge rails with vertical labels, a scroll-position indicator, and a
 * live telemetry readout.
 *
 * It is what makes the page read as an instrument rather than a brochure. All
 * of it is decorative, so the whole frame is hidden from assistive tech and
 * never takes pointer events.
 *
 * Both the progress fill and the readout are written straight to the DOM
 * rather than through state: they update on every scroll frame and every
 * tick, and re-rendering React that often for decoration would be wasteful.
 */

/** Numbers drift around a plausible baseline so the panel looks live. */
const METRICS = [
  { label: 'ev/s', base: 2400, spread: 420, format: (n: number) => n.toFixed(0) },
  { label: 'p95', base: 82, spread: 14, format: (n: number) => `${n.toFixed(0)}ms` },
  { label: 'err', base: 0.4, spread: 0.18, format: (n: number) => `${n.toFixed(2)}%` },
];

export function InstrumentFrame() {
  const fillRef = useRef<HTMLElement | null>(null);
  const readoutRef = useRef<HTMLDivElement | null>(null);
  const valueRefs = useRef<Array<HTMLElement | null>>([]);

  useEffect(() => {
    let frame = 0;
    let queued = false;

    const paint = () => {
      queued = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      const pct = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
      if (fillRef.current) fillRef.current.style.height = `${pct * 100}%`;

      // The readout is a hero instrument. Past the first chapter the panels
      // put their own content in that corner, so it retires rather than
      // sitting on top of them.
      if (readoutRef.current) {
        const past = window.scrollY > window.innerHeight * 0.75;
        readoutRef.current.classList.toggle('is-hidden', past);
      }
    };

    const onScroll = () => {
      if (queued) return;
      queued = true;
      frame = window.requestAnimationFrame(paint);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    paint();

    // A slow tick is enough to read as live without drawing the eye away
    // from the content.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timer = reduced
      ? null
      : window.setInterval(() => {
          METRICS.forEach((metric, i) => {
            const node = valueRefs.current[i];
            if (!node) return;
            const drift = (Math.random() - 0.5) * 2 * metric.spread;
            node.textContent = metric.format(Math.max(0, metric.base + drift));
          });
        }, 2200);

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      window.cancelAnimationFrame(frame);
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return (
    <>
      <div className="frame-rails" aria-hidden="true">
        <div className="frame-grid" />

        <div className="frame-edge is-left">
          <span className="rail-label is-top">TraceIQ — self-hosted</span>
          <span className="rail-progress">
            <i ref={(el) => { fillRef.current = el; }} />
          </span>
        </div>

        <div className="frame-edge is-right">
          <span className="rail-label">Scroll to explore</span>
        </div>
      </div>

      <div className="readout" aria-hidden="true" ref={readoutRef}>
        {METRICS.map((metric, i) => (
          <div key={metric.label}>
            <span>{metric.label}</span>
            <b
              className={metric.label === 'err' ? 'is-good' : undefined}
              ref={(el) => { valueRefs.current[i] = el; }}
            >
              {metric.format(metric.base)}
            </b>
          </div>
        ))}
      </div>
    </>
  );
}

export default InstrumentFrame;
