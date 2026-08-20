'use client';

import { useEffect, useState } from 'react';

type OverallStatus = 'checking' | 'operational' | 'degraded' | 'down';

const REQUEST_TIMEOUT_MS = 5_000;
const REFRESH_INTERVAL_MS = 30_000;

async function probe(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export function LiveFooterStatus() {
  const [status, setStatus] = useState<OverallStatus>('checking');

  useEffect(() => {
    let mounted = true;
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

    async function checkHealth() {
      const [apiOk, dbOk] = await Promise.all([
        probe(`${apiBaseUrl}/health`),
        probe(`${apiBaseUrl}/health/db`)
      ]);

      if (!mounted) return;

      if (apiOk && dbOk) {
        setStatus('operational');
      } else if (apiOk) {
        setStatus('degraded');
      } else {
        setStatus('down');
      }
    }

    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, REFRESH_INTERVAL_MS);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const meta: Record<OverallStatus, { text: string; dotClass: string }> = {
    checking: { text: 'Checking system status…', dotClass: 'checking' },
    operational: { text: 'All systems operational', dotClass: 'operational' },
    degraded: { text: 'Partial system outage', dotClass: 'degraded' },
    down: { text: 'Systems offline', dotClass: 'down' }
  };

  const { text, dotClass } = meta[status];

  return (
    <a
      href="/status"
      className="footer-status group transition-all duration-200 hover:text-white"
      title="Click to view live system status page"
    >
      <span className={`status-dot ${dotClass}`} />
      <span className="group-hover:underline decoration-white/30 underline-offset-4">{text}</span>
    </a>
  );
}
