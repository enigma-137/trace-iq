'use client';

import { useEffect, useRef, useState } from 'react';
import { joinWaitlist } from './actions';

const signals = ['funnels', 'insights', 'user timelines', 'retention', 'revenue', 'error tracking', 'web analytics'];

export default function DashboardHomePage() {
  const pageRef = useRef<HTMLElement>(null);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setMessage('');
    setErrorMsg('');

    try {
      const res = await joinWaitlist(email);
      if (res.success) {
        setMessage(res.message || 'Thank you!');
        setEmail('');
      } else {
        setErrorMsg(res.error || 'Failed to join waitlist.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

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
        <div className="nav-actions">
          {/* <a className="nav-link-ghost" href="/auth/login">
            Sign in
          </a> */}
         <a
  href="https://www.eniigma.dev/contact"
  target="_blank"
  rel="noopener noreferrer"
  className="nav-link"
>
  Contact
</a>
        </div>
      </nav>

      <section className="hero-stage" aria-labelledby="hero-title">
        <div className="hero-copy">
          <p className="eyebrow">Product analytics · private beta</p>
          <h1 id="hero-title">See every product journey before it slips.</h1>
          <p className="hero-lede">
            TraceIQ unifies clean event tracking, funnels, user timelines, retention,
            revenue, and error tracking in one fast, privacy-friendly dashboard — instead
            of duct-taping five tools together.
          </p>

          <form className="waitlist-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              placeholder="work@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? 'Joining...' : 'Request early access'}
            </button>
          </form>
          {message && <p className="mt-4 text-zinc-300 text-sm font-medium">{message}</p>}
          {errorMsg && <p className="mt-4 text-zinc-400 text-sm font-medium">{errorMsg}</p>}
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
