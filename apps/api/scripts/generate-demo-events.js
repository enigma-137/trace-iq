// Dev helper: sends a realistic multi-step funnel dataset to the ingestion API so
// the Insights / Funnels / Users dashboards have data to render.
//
// Usage:
//   TRACEIQ_PROJECT_ID=proj_xxx TRACEIQ_WRITE_KEY=trq_live_xxx \
//     node apps/api/scripts/generate-demo-events.js
//
// Optional env: API_URL (default http://localhost:4000), TRACEIQ_USERS (default 40),
//               TRACEIQ_DAYS (default 14).

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const projectId = process.env.TRACEIQ_PROJECT_ID;
const writeKey = process.env.TRACEIQ_WRITE_KEY;
const userCount = Number(process.env.TRACEIQ_USERS ?? '40');
const days = Number(process.env.TRACEIQ_DAYS ?? '14');

if (!projectId || !writeKey) {
  console.error('Set TRACEIQ_PROJECT_ID and TRACEIQ_WRITE_KEY (copy them from the dashboard Setup panel).');
  process.exit(1);
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PLANS = ['free', 'free', 'free', 'pro']; // ~25% pro, for breakdown testing

// Simulated device + location so the dashboard shows device/geo without real traffic.
const DEVICES = [
  { platform: 'web', os: 'iOS', deviceType: 'mobile', browser: 'Safari' },
  { platform: 'web', os: 'Android', deviceType: 'mobile', browser: 'Chrome' },
  { platform: 'web', os: 'iOS', deviceType: 'mobile', browser: 'Safari' },
  { platform: 'web', os: 'macOS', deviceType: 'desktop', browser: 'Chrome' },
  { platform: 'web', os: 'Windows', deviceType: 'desktop', browser: 'Edge' },
  { platform: 'web', os: 'Android', deviceType: 'mobile', browser: 'Chrome' }
];
const LOCATIONS = [
  { country: 'NG', region: 'Lagos', city: 'Lagos' },
  { country: 'US', region: 'CA', city: 'San Francisco' },
  { country: 'GB', region: 'ENG', city: 'London' },
  { country: 'NG', region: 'FCT', city: 'Abuja' },
  { country: 'KE', region: 'Nairobi', city: 'Nairobi' },
  { country: 'US', region: 'NY', city: 'New York' }
];
const REFERRERS = ['', '', 'https://www.google.com/', 'https://twitter.com/', 'https://news.ycombinator.com/', ''];
const PATHS = {
  $page: '/',
  signup_started: '/signup',
  signup_completed: '/signup/complete',
  onboarding_finished: '/onboarding',
  purchase: '/checkout'
};
const SAMPLE_ERRORS = [
  { type: 'TypeError', message: "Cannot read properties of null (reading 'id')", stack: "TypeError: Cannot read properties of null (reading 'id')\n    at Dashboard (app/dashboard/page.tsx:42:18)" },
  { type: 'TypeError', message: 'Load failed', stack: 'TypeError: Load failed\n    at fetchWallets (src/hooks/useWallets.ts:19:7)' },
  { type: 'Error', message: 'Network request timed out', stack: 'Error: Network request timed out\n    at apiClient (src/lib/api.ts:88:11)' }
];

// Ordered funnel with realistic drop-off between steps.
const FUNNEL = [
  { name: 'signup_started', keepRate: 1.0 },
  { name: 'signup_completed', keepRate: 0.7 },
  { name: 'onboarding_finished', keepRate: 0.6 },
  { name: 'purchase', keepRate: 0.45 }
];

async function send(event) {
  const response = await fetch(`${apiUrl}/v1/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-traceiq-write-key': writeKey },
    body: JSON.stringify(event)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ingestion failed (${response.status}): ${text}`);
  }
}

function pick(list, index) {
  return list[index % list.length];
}

// Varied purchase amounts so Sum/Average-of-amount insights show a real distribution.
// Pro plans skew larger; every value gets jitter so no two look identical.
function purchaseAmount(plan) {
  const base = plan === 'pro' ? 120 : 40;
  const spread = plan === 'pro' ? 180 : 60;
  return Math.round((base + Math.random() * spread) * 100) / 100;
}

async function main() {
  const now = Date.now();
  let sent = 0;

  for (let i = 0; i < userCount; i += 1) {
    const userId = `demo_user_${i + 1}`;
    const sessionId = `demo_sess_${i + 1}`;
    const plan = PLANS[i % PLANS.length];
    const deviceInfo = pick(DEVICES, i);
    const networkInfo = pick(LOCATIONS, i);
    const referrer = pick(REFERRERS, i);
    const ctx = (path) => ({ page: { path, referrer } });
    // Spread each user's journey across a random day in the window.
    const dayOffset = Math.floor((i / userCount) * days);
    let t = now - dayOffset * DAY_MS - Math.floor(Math.random() * DAY_MS);

    // Baseline page view for every visitor.
    await send({
      projectId,
      userId,
      sessionId,
      eventName: '$page',
      properties: { plan, path: PATHS.$page },
      deviceInfo,
      networkInfo,
      context: ctx(PATHS.$page),
      timestamp: new Date(t).toISOString()
    });
    sent += 1;

    let reached = true;
    for (const step of FUNNEL) {
      if (!reached || Math.random() > step.keepRate) {
        reached = false;
        break;
      }
      t += 60_000 + Math.floor(Math.random() * 300_000); // 1–6 min between steps
      await send({
        projectId,
        userId,
        sessionId,
        eventName: step.name,
        properties: { plan, amount: step.name === 'purchase' ? purchaseAmount(plan) : undefined },
        deviceInfo,
        networkInfo,
        context: ctx(PATHS[step.name] ?? '/'),
        timestamp: new Date(t).toISOString()
      });
      sent += 1;
    }

    // Some users hit an exception, so the error-tracking page has data.
    if (i % 6 === 0) {
      const err = pick(SAMPLE_ERRORS, i);
      t += 30_000 + Math.floor(Math.random() * 120_000);
      await send({
        projectId,
        userId,
        sessionId,
        eventName: '$exception',
        properties: { type: err.type, message: err.message, stack: err.stack, handled: false },
        deviceInfo,
        networkInfo,
        context: ctx('/dashboard'),
        timestamp: new Date(t).toISOString()
      });
      sent += 1;
    }

    // Some users rage-click on a frustrating page.
    if (i % 5 === 0) {
      const ragePath = pick(['/login', '/checkout', '/signup'], i);
      t += 20_000 + Math.floor(Math.random() * 90_000);
      await send({
        projectId,
        userId,
        sessionId,
        eventName: '$rageclick',
        properties: { x: 120, y: 240, element: 'button' },
        deviceInfo,
        networkInfo,
        context: ctx(ragePath),
        timestamp: new Date(t).toISOString()
      });
      sent += 1;
    }
  }

  console.log(`Sent ${sent} events across ${userCount} users over the last ${days} days to project ${projectId}.`);
  console.log('Now open the dashboard: Overview, Insights (try event=signup_started, break down by "plan"),');
  console.log('Funnels (signup_started → signup_completed → onboarding_finished → purchase), and Users.');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
