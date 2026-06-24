'use client';

import { useEffect, useRef } from 'react';

const signals = ['funnels', 'sessions', 'replay', 'retention', 'payments'];

export default function DashboardHomePage() {
  const pageRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const page = pageRef.current;
    if (!page) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const rect = page.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      page.style.setProperty('--mouse-x', `${x}px`);
      page.style.setProperty('--mouse-y', `${y}px`);
      page.style.setProperty('--tilt-x', `${((y / rect.height) - 0.5) * -10}deg`);
      page.style.setProperty('--tilt-y', `${((x / rect.width) - 0.5) * 10}deg`);
      page.style.setProperty('--grid-x', `${((x / rect.width) - 0.5) * -18}px`);
      page.style.setProperty('--grid-y', `${((y / rect.height) - 0.5) * -18}px`);
    };

    page.addEventListener('pointermove', handlePointerMove);
    return () => page.removeEventListener('pointermove', handlePointerMove);
  }, []);

  return (
    <main ref={pageRef} className="coming-soon-shell">
      <div className="cursor-glow" />
      <div className="grain-layer" />

      <nav className="landing-nav" aria-label="Main navigation">
        <a className="brand-mark" href="/">
          TraceIQ
        </a>
        <a className="nav-link" href="mailto:hello@traceiq.dev">
          Join waitlist
        </a>
      </nav>

      <section className="hero-stage" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Behavior intelligence is loading</p>
          <h1 id="hero-title">See every product journey before it slips away.</h1>
          <p className="hero-lede">
            TraceIQ is a coming-soon analytics platform for teams that need clean event
            tracking, funnel clarity, user timelines, replay context, and AI conversion
            diagnosis without duct-taping five tools together.
          </p>

          <form className="waitlist-form" action="mailto:hello@traceiq.dev" method="post">
            <label className="sr-only" htmlFor="email">
              Work email
            </label>
            <input id="email" name="email" type="email" placeholder="work@email.com" />
            <button type="submit">Request early access</button>
          </form>
        </div>

        <div className="signal-panel" aria-label="TraceIQ preview">
          <div className="panel-topline">
            <span>Live journey map</span>
            <span>private beta</span>
          </div>

          <div className="journey-line">
            <div>
              <strong>Signup completed</strong>
              <span>2,847 users</span>
            </div>
            <div>
              <strong>KYC started</strong>
              <span>1,902 users</span>
            </div>
            <div className="drop-warning">
              <strong>Payment failed</strong>
              <span>37.4% drop-off</span>
            </div>
          </div>

          <div className="metric-grid">
            <div>
              <span>conversion</span>
              <strong>61.8%</strong>
            </div>
            <div>
              <span>sessions</span>
              <strong>18.2k</strong>
            </div>
            <div>
              <span>signals</span>
              <strong>124</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="Planned capabilities">
        {signals.map((signal) => (
          <span key={signal}>{signal}</span>
        ))}
      </section>
    </main>
  );
}
