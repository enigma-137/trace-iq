import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const apiBaseUrl = process.env.TRACEIQ_API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// Visitor headers the API needs to record the click (device, location, referrer). Vercel's
// geo headers describe the visitor, so the API uses them instead of looking up an IP.
const FORWARDED_HEADERS = [
  'user-agent',
  'accept-language',
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-vercel-ip-country-region',
  'x-vercel-ip-city'
];

/** Short-link redirect: asks the API where /l/<slug> goes, then sends the visitor there. */
export async function GET(request: NextRequest, { params }: { params: { slug: string } }) {
  const headers: Record<string, string> = {};
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }
  const referrer = request.headers.get('referer');
  if (referrer) headers['x-traceiq-referrer'] = referrer;
  // The API is reached through its own proxy, which replaces X-Forwarded-For with this
  // server's address, so the visitor's IP travels in a header that proxy leaves alone.
  const visitorIp = clientIp(request);
  if (visitorIp) headers['x-traceiq-client-ip'] = visitorIp;

  let status = 502;
  try {
    const response = await fetch(`${apiBaseUrl}/v1/links/resolve/${encodeURIComponent(params.slug)}`, {
      headers,
      cache: 'no-store',
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      const { destination } = (await response.json()) as { destination?: string };
      if (destination) {
        return NextResponse.redirect(destination, {
          status: 302,
          headers: { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer-when-downgrade' }
        });
      }
    }
    status = response.status;
  } catch {
    status = 502;
  }

  return new NextResponse(errorPage(status), {
    status: status === 404 || status === 410 ? status : 502,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function clientIp(request: NextRequest): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return request.ip ?? (forwarded || request.headers.get('x-real-ip')?.trim() || undefined);
}

function errorPage(status: number) {
  const [title, text] =
    status === 410
      ? ['This link has expired', 'Whoever shared it set it to stop working after a certain date.']
      : status === 404
        ? ['This link does not exist', 'Check the address for typos, or ask whoever shared it for a new one.']
        : ['This link is not working right now', 'Try again in a moment.'];
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#cdeafd;color:#101715;font:16px/1.5 system-ui,sans-serif;padding:16px}main{max-width:440px;background:#fff;border:1px solid #d4e2f2;padding:32px}h1{margin:0;font-size:26px;letter-spacing:-.03em}p{color:#64706e}a{display:inline-block;margin-top:8px;background:#245beb;color:#fff;padding:11px 18px;text-decoration:none;font-weight:600;font-size:14px}</style></head>
<body><main><h1>${title}</h1><p>${text}</p><a href="/">Go to TraceIQ</a></main></body></html>`;
}
