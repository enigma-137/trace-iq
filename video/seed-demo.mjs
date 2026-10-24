// Seeds a local TraceIQ instance with 30 days of believable product data for
// the promo video: page views, a signup funnel, identified users, errors,
// API requests and logs, all for a fictional SaaS called "Acme".
//
// Usage: node video/seed-demo.mjs [apiUrl]
// Expects the local stack (AUTH_MODE=local) with TRUST_PROXY_HEADERS=true so
// the forwarded IPs below resolve to countries.

import { randomUUID } from 'node:crypto';

const API = process.argv[2] ?? 'http://localhost:4000';
const PROJECT_ID = 'proj_local';
const WRITE_KEY = 'trq_local_development_only';
const DAYS = 30;
const USERS = 900;

// Deterministic randomness so every run produces the same charts.
let seed = 137;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = (items) => items[Math.floor(rand() * items.length)];
const weighted = (pairs) => {
  const total = pairs.reduce((sum, [, w]) => sum + w, 0);
  let r = rand() * total;
  for (const [value, w] of pairs) if ((r -= w) <= 0) return value;
  return pairs[0][0];
};

// Public IPs from well-known ranges, one per country, for geo lookups.
const IPS = [
  ['8.8.8.8', 30], ['81.2.69.142', 12], ['102.89.32.10', 14], ['41.190.2.4', 6],
  ['49.36.0.1', 10], ['85.214.132.117', 8], ['177.71.0.1', 6], ['203.2.218.214', 4],
  ['142.250.64.78', 6], ['105.112.0.1', 4]
];
const AGENTS = [
  [{ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', os: 'macOS', osVersion: '14.5', browser: 'Chrome', browserVersion: '129.0', deviceType: 'desktop' }, 40],
  [{ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36', os: 'Windows', osVersion: '10.0', browser: 'Chrome', browserVersion: '129.0', deviceType: 'desktop' }, 25],
  [{ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1', os: 'iOS', osVersion: '17.6', browser: 'Safari', browserVersion: '17.6', deviceType: 'mobile' }, 20],
  [{ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', os: 'Android', osVersion: '14', browser: 'Chrome', browserVersion: '129.0', deviceType: 'mobile' }, 10],
  [{ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5; rv:131.0) Gecko/20100101 Firefox/131.0', os: 'macOS', osVersion: '14.5', browser: 'Firefox', browserVersion: '131.0', deviceType: 'desktop' }, 5]
];
const REFERRERS = [
  ['https://www.google.com/', 40], ['', 25], ['https://news.ycombinator.com/', 10],
  ['https://x.com/', 8], ['https://github.com/', 10], ['https://www.producthunt.com/', 7]
];
const UTM = [[null, 70], [{ source: 'newsletter', medium: 'email', campaign: 'october_launch' }, 15], [{ source: 'twitter', medium: 'social', campaign: 'launch_week' }, 15]];
const PLANS = [['starter', 60], ['pro', 30], ['team', 10]];
const FIRST = ['Ada', 'Tunde', 'Mia', 'Kofi', 'Lena', 'Ravi', 'Zara', 'Noah', 'Amara', 'Leo', 'Ife', 'Sofia', 'Kai', 'Nia', 'Omar', 'Yuki'];
const LAST = ['Okafor', 'Lind', 'Mensah', 'Patel', 'Silva', 'Chen', 'Adeyemi', 'Novak', 'Haddad', 'Kim', 'Brown', 'Diallo'];

const ERRORS = [
  { type: 'TypeError', message: "Cannot read properties of undefined (reading 'items')", fn: 'renderCart', file: 'src/components/Cart.tsx', line: 42, path: '/checkout', weight: 30 },
  { type: 'ChunkLoadError', message: 'Loading chunk 812 failed.', fn: 'loadChunk', file: 'src/app/dashboard/page.tsx', line: 11, path: '/dashboard', weight: 12 },
  { type: 'Error', message: 'Payment provider timed out after 10000ms', fn: 'confirmPayment', file: 'src/lib/billing.ts', line: 88, path: '/checkout', weight: 18 },
  { type: 'RangeError', message: 'Invalid time value', fn: 'formatDate', file: 'src/lib/dates.ts', line: 17, path: '/invoices', weight: 8 },
  { type: 'SyntaxError', message: 'Unexpected token < in JSON at position 0', fn: 'parseResponse', file: 'src/lib/api.ts', line: 23, path: '/settings', weight: 5 }
];
const ROUTES = [
  { method: 'GET', route: '/api/projects', p50: 45, errorRate: 0.004, weight: 30 },
  { method: 'POST', route: '/api/invoices', p50: 140, errorRate: 0.02, weight: 12 },
  { method: 'GET', route: '/api/invoices/:id', p50: 60, errorRate: 0.006, weight: 18 },
  { method: 'POST', route: '/api/checkout', p50: 380, errorRate: 0.05, weight: 8 },
  { method: 'GET', route: '/api/me', p50: 20, errorRate: 0.001, weight: 25 },
  { method: 'POST', route: '/api/auth/login', p50: 210, errorRate: 0.03, weight: 7 }
];

const events = [];
const logs = [];

function baseEvent(user, session, at, agent, ip) {
  const { ua, server, ...device } = agent;
  return { ip, item: {
    userId: user.identified ? user.id : undefined,
    anonymousId: user.anonymousId,
    sessionId: session,
    timestamp: at.toISOString(),
    deviceInfo: { platform: server ? 'server' : 'web', ...device, userAgent: ua, locale: 'en-US' },
    context: { library: { name: 'traceiq-sdk-js', version: '0.1.0' } }
  } };
}

function page(user, session, at, ua, ip, path, referrer, utm) {
  const ev = baseEvent(user, session, at, ua, ip);
  ev.item.eventName = '$page';
  ev.item.properties = { name: path === '/' ? 'Acme' : `Acme · ${path.slice(1)}`, path };
  ev.item.context.page = { url: `https://acme.app${path}`, path, referrer, title: 'Acme', utm: utm ?? {} };
  events.push(ev);
}

function track(user, session, at, ua, ip, name, properties = {}, path = '/') {
  const ev = baseEvent(user, session, at, ua, ip);
  ev.item.eventName = name;
  ev.item.properties = { path, ...properties };
  ev.item.context.page = { url: `https://acme.app${path}`, path, title: 'Acme' };
  events.push(ev);
}

const now = Date.now();
const DAY = 86_400_000;
const todayStart = now - (now % DAY);

for (let u = 0; u < USERS; u++) {
  // Growth: later days get more new users.
  const firstDay = Math.floor(DAYS * Math.sqrt(rand()));
  const user = {
    id: `user_${1000 + u}`,
    anonymousId: `anon_${randomUUID().slice(0, 12)}`,
    identified: false,
    name: `${pick(FIRST)} ${pick(LAST)}`,
    plan: weighted(PLANS)
  };
  const ua = weighted(AGENTS);
  const ip = weighted(IPS);
  const sessions = 1 + Math.floor(rand() * rand() * 8);

  for (let s = 0; s < sessions; s++) {
    const day = Math.min(DAYS - 1, firstDay + Math.floor(rand() * (DAYS - firstDay)) * (s === 0 ? 0 : 1));
    const hour = weighted([[9, 3], [11, 4], [14, 5], [16, 4], [20, 3], [23, 1]]);
    // Days are calendar days (UTC). Today's sessions are squeezed into the
    // hours elapsed so far, so charts don't end in a partial-day dip.
    const dayStart = todayStart - (DAYS - 1 - day) * DAY;
    const offset = (hour + rand() * 0.8) * 3_600_000;
    let at = new Date(day === DAYS - 1 ? dayStart + (offset / DAY) * (now - 1_500_000 - dayStart) : dayStart + offset);
    const session = `sess_${randomUUID().slice(0, 16)}`;
    const step = () => (at = new Date(at.getTime() + 8_000 + rand() * 60_000));
    const referrer = s === 0 ? weighted(REFERRERS) : '';
    const utm = s === 0 ? weighted(UTM) : null;

    if (s === 0) {
      page(user, session, at, ua, ip, '/', referrer, utm);
      if (rand() < 0.62) { step(); page(user, session, at, ua, ip, '/pricing', '', utm); }
      if (rand() < 0.55) {
        step(); track(user, session, at, ua, ip, 'signup_started', { plan: user.plan }, '/signup');
        if (rand() < 0.72) {
          step(); user.identified = true;
          track(user, session, at, ua, ip, '$identify', { traits: { name: user.name, email: `${user.name.split(' ')[0].toLowerCase()}@example.com`, plan: user.plan } }, '/signup');
          track(user, session, at, ua, ip, 'signup_completed', { plan: user.plan }, '/signup');
          if (rand() < 0.68) {
            step(); page(user, session, at, ua, ip, '/onboarding', '', null);
            track(user, session, at, ua, ip, 'project_created', { template: pick(['blank', 'invoicing', 'crm']) }, '/onboarding');
            if (rand() < 0.45) {
              step(); track(user, session, at, ua, ip, 'checkout_started', { plan: user.plan }, '/checkout');
              if (rand() < 0.7) { step(); track(user, session, at, ua, ip, 'subscription_purchased', { plan: user.plan, amount: { starter: 12, pro: 29, team: 79 }[user.plan] }, '/checkout'); }
            }
          }
        }
      }
    } else {
      page(user, session, at, ua, ip, '/dashboard', referrer, null);
      const actions = 1 + Math.floor(rand() * 4);
      for (let a = 0; a < actions; a++) {
        step();
        const path = pick(['/dashboard', '/invoices', '/invoices/new', '/settings', '/reports']);
        page(user, session, at, ua, ip, path, '', null);
        if (path === '/invoices/new') track(user, session, at, ua, ip, 'invoice_created', { amount: Math.round(50 + rand() * 950) }, path);
        if (path === '/reports' && rand() < 0.5) track(user, session, at, ua, ip, 'report_exported', { format: pick(['csv', 'pdf']) }, path);
      }
    }

    // Errors, weighted toward checkout.
    if (rand() < 0.09) {
      const err = weighted(ERRORS.map((e) => [e, e.weight]));
      step();
      track(user, session, at, ua, ip, '$exception', {
        type: err.type,
        message: err.message,
        stack: `${err.type}: ${err.message}\n    at ${err.fn} (${err.file}:${err.line}:17)\n    at renderWithHooks (node_modules/react-dom/cjs/react-dom.production.js:10422:18)\n    at mountIndeterminateComponent (node_modules/react-dom/cjs/react-dom.production.js:12401:13)`,
        handled: false
      }, err.path);
    }

    // Backend requests made during the session.
    const calls = 2 + Math.floor(rand() * 6);
    for (let c = 0; c < calls; c++) {
      const r = weighted(ROUTES.map((x) => [x, x.weight]));
      const failed = rand() < r.errorRate;
      const durationMs = Math.round(r.p50 * (0.5 + rand() * rand() * 4) * (failed ? 2.5 : 1));
      const status = failed ? pick([500, 502, 504]) : r.method === 'POST' ? 201 : 200;
      const reqAt = new Date(at.getTime() + c * 1500);
      const traceId = randomUUID().replace(/-/g, '');
      const ev = baseEvent(user, session, reqAt, { ua: 'node', server: true }, ip);
      ev.item.eventName = '$api_request';
      ev.item.properties = { method: r.method, route: r.route, path: r.route.replace(':id', 'inv_' + Math.floor(rand() * 9999)), status, durationMs, service: 'acme-api', environment: 'production', host: 'api.acme.app', traceId };
      events.push(ev);
      logs.push({
        level: failed ? 'error' : durationMs > 800 ? 'warn' : 'info',
        source: 'server',
        service: 'acme-api',
        message: failed ? `${r.method} ${r.route} failed with ${status}` : durationMs > 800 ? `Slow request ${r.method} ${r.route} took ${durationMs}ms` : `${r.method} ${r.route} ${status}`,
        method: r.method, route: r.route, statusCode: status, durationMs, traceId,
        sessionId: session, distinctId: user.identified ? user.id : user.anonymousId,
        environment: 'production', timestamp: reqAt.toISOString(),
        metadata: { timestamp: reqAt.toISOString() }
      });
    }
  }
}

// A handful of visitors browsing right now, for the realtime counter.
// Capture screens within a few minutes of seeding so they still count as live.
for (let v = 0; v < 14; v++) {
  const user = { id: `user_live_${v}`, anonymousId: `anon_live_${v}`, identified: false };
  const session = `sess_live_${v}`;
  const ua = weighted(AGENTS);
  const ip = weighted(IPS);
  const at = new Date(now - rand() * 180_000);
  page(user, session, at, ua, ip, pick(['/', '/pricing', '/dashboard', '/invoices']), weighted(REFERRERS), null);
}

async function post(path, body, ip) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-traceiq-write-key': WRITE_KEY, ...(ip ? { 'x-forwarded-for': ip } : {}) },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`${path} ${res.status}: ${await res.text()}`);
  return res.json();
}

// Events go in per-IP batches so each lands with its own country.
events.sort((a, b) => a.item.timestamp.localeCompare(b.item.timestamp));
const byIp = new Map();
for (const ev of events) {
  if (!byIp.has(ev.ip)) byIp.set(ev.ip, []);
  byIp.get(ev.ip).push(ev.item);
}
let sent = 0;
for (const [ip, items] of byIp) {
  for (let i = 0; i < items.length; i += 250) {
    const batch = items.slice(i, i + 250);
    const out = await post('/v1/events/batch', { projectId: PROJECT_ID, batch }, ip);
    const rejected = out.results.filter((r) => !r.accepted);
    if (rejected.length) console.warn(`${rejected.length} rejected, e.g. ${rejected[0].error}`);
    sent += batch.length;
  }
}
console.log(`events: ${sent}`);

let logged = 0;
for (let i = 0; i < logs.length; i += 100) {
  await post('/v1/logs/batch', { projectId: PROJECT_ID, logs: logs.slice(i, i + 100) });
  logged += Math.min(100, logs.length - i);
}
console.log(`logs: ${logged}`);

// A saved funnel so the Funnels page has something to show.
const funnel = await fetch(`${API}/v1/dashboard/funnels`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    projectId: PROJECT_ID,
    name: 'Signup to paid',
    steps: ['signup_started', 'signup_completed', 'project_created', 'checkout_started', 'subscription_purchased']
  })
});
console.log(`funnel: ${funnel.status}`);
