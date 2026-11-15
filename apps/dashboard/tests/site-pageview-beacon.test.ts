import { describe, expect, it } from 'vitest';
import { isPublicSitePath } from '../src/components/SitePageviewBeacon';

describe('site pageview beacon', () => {
  it('counts only the public site', () => {
    for (const path of ['/', '/pricing', '/blog', '/blog/meet-ask-traceiq', '/docs/sdk', '/waitlist']) {
      expect(isPublicSitePath(path)).toBe(true);
    }
    for (const path of ['/dashboard', '/dashboard/events', '/admin', '/auth/login', '/invite/abc', '/pricingx', '/share/x']) {
      expect(isPublicSitePath(path)).toBe(false);
    }
  });
});
