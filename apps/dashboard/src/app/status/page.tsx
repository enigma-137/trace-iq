'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const REFRESH_MS = 30_000;
const REQUEST_TIMEOUT_MS = 6_000;

type OverallStatus = 'checking' | 'operational' | 'degraded' | 'down';

interface CheckState {
  name: string;
  detail: string;
  ok: boolean | null;
  latency: number | null;
}

const STATUS_META: Record<OverallStatus, { title: string; subtitle: string; image: string }> = {
  checking: {
    title: 'CHECKING SYSTEMS',
    subtitle: 'Probing our services from your region\u2026',
    image: ''
  },
  operational: {
    title: 'ALL SYSTEMS OPERATIONAL',
    subtitle: 'LGTM \u2014 every check is passing.',
    image: '/brand/status-good.png'
  },
  degraded: {
    title: 'PARTIAL OUTAGE',
    subtitle: 'Core ingestion is up, but the data layer is not responding.',
    image: '/brand/status-bad.png'
  },
  down: {
    title: 'SERVICE DOWN',
    subtitle: `We couldn\u2019t reach the API at ${apiBaseUrl}.`,
    image: '/brand/status-bad.png'
  }
};

async function probe(url: string): Promise<{ ok: boolean; latency: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const started = performance.now();
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    const latency = Math.max(0, Math.round(performance.now() - started));
    return { ok: response.ok, latency };
  } catch {
    const latency = Math.max(0, Math.round(performance.now() - started));
    return { ok: false, latency };
  } finally {
    clearTimeout(timer);
  }
}

export default function StatusPage() {
  const [overall, setOverall] = useState<OverallStatus>('checking');
  const [checks, setChecks] = useState<Record<string, CheckState>>({});
  const [lastChecked, setLastChecked] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  const run = useCallback(async () => {
    setRefreshing(true);
    const [api, database] = await Promise.all([probe(`${apiBaseUrl}/health`), probe(`${apiBaseUrl}/health/db`)]);

    const apiOk = api.ok;
    const dbOk = database.ok;
    const next: OverallStatus = apiOk && dbOk ? 'operational' : apiOk ? 'degraded' : 'down';

    setChecks({
      api: {
        name: 'API service',
        detail: 'Core ingestion & read APIs respond to health checks',
        ok: apiOk,
        latency: api.latency
      },
      database: {
        name: 'Database',
        detail: 'PostgreSQL reachable and responding to queries',
        ok: dbOk,
        latency: database.latency
      }
    });
    setOverall(next);
    setLastChecked(Date.now());
    setRefreshing(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    void run();
    const interval = setInterval(() => {
      if (mountedRef.current) void run();
    }, REFRESH_MS);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [run]);

  const meta = STATUS_META[overall];
  const statusClass = `status-page status-${overall}`;
  const order = ['api', 'database'] as const;

  return (
    <main className={statusClass}>
      <div className="status-vignette" />

      <nav className="status-nav">
        <a className="status-brand" href="/" aria-label="TraceIQ home">
          <img src="/brand/logo-white-no-bg.png" alt="" className="h-7 w-auto" />
          <span className="text-lg font-semibold tracking-tight text-white">TraceIQ</span>
        </a>
        <span className="status-nav-tag">System status</span>
      </nav>

      <div className="status-wrap">
        <section className="status-hero status-fade-in" key={lastChecked ?? 'boot'} aria-live="polite">
          <div className="status-badge">
            <div className="status-ring" aria-hidden />
            {overall === 'checking'
              ? (
                  <div className="status-badge-checking" aria-hidden>
                    <span />
                    <span />
                    <span />
                  </div>
                )
              : (
                  <img className="status-badge-img" src={meta.image} alt="" width={96} height={96} />
                )}
          </div>

          <h1 className="status-title">{meta.title}</h1>
          <p className="status-subtitle">{meta.subtitle}</p>

          <div className="status-checks">
            {order.map((id) => {
              const check = checks[id];
              const stateClass = check === undefined ? 'pending' : check.ok === true ? 'ok' : 'bad';
              return (
                <div key={id} className="status-check-row">
                  <span className={`status-dot ${stateClass}`} aria-hidden />
                  <div className="status-check-name">
                    <span>{check?.name ?? 'Probing\u2026'}</span>
                    <small>{check?.detail ?? 'Contacting the service\u2026'}</small>
                  </div>
                  <span className="status-check-meta">
                    {check === undefined ? 'checking' : `${check.ok ? 'OK' : 'FAIL'} \u00b7 ${check.latency}ms`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="status-footer">
            <div className="status-updated">
              {refreshing ? (
                <span className="inline-flex items-center gap-2">
                  <RefreshCw size={13} className="animate-spin" /> refreshing\u2026
                </span>
              ) : (
                <span>
                  Last checked{' '}
                  <span className="font-mono text-slate-300">
                    {lastChecked ? new Date(lastChecked).toLocaleTimeString() : '\u2014'}
                  </span>
                </span>
              )}
              <span className="text-slate-500">\u00b7 auto-refreshes every 30s</span>
            </div>
            <div className="status-meter" aria-hidden>
              <div key={lastChecked ?? 0} className="status-meter-fill" />
            </div>
            <button
              type="button"
              className="status-refresh"
              onClick={() => void run()}
              disabled={refreshing}
              aria-label="Refresh status now"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}