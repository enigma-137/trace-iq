'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/** The public site; product routes (dashboard, admin, auth...) are never counted. */
const PUBLIC_PREFIXES = ['/pricing', '/blog', '/docs', '/features', '/waitlist', '/privacy', '/terms', '/status', '/demo', '/sdk-demo'];

/** Set on this browser when a platform admin opens /admin, so the team's own visits don't count. */
export const SKIP_SITE_STATS_KEY = 'traceiq-skip-site-stats';

export function isPublicSitePath(path: string): boolean {
  return path === '/' || PUBLIC_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * Counts page loads on the public site for the admin Growth numbers. Cookieless: it
 * sends only the path, the referrer on the first page, and utm_source. Not TraceIQ
 * product tracking and not tied to any project.
 */
export function SitePageviewBeacon() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    const isFirst = first.current;
    first.current = false;
    if (!pathname || !isPublicSitePath(pathname)) return;
    try {
      if (navigator.webdriver || localStorage.getItem(SKIP_SITE_STATS_KEY) === '1') return;
    } catch {
      // Storage blocked: still count the visit.
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
    const utmSource = new URLSearchParams(window.location.search).get('utm_source');
    void fetch(`${apiUrl}/v1/site/pageview`, {
      method: 'POST',
      keepalive: true,
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: pathname,
        referrer: isFirst ? document.referrer || null : null,
        utmSource: utmSource || null
      })
    }).catch(() => undefined);
  }, [pathname]);

  return null;
}
