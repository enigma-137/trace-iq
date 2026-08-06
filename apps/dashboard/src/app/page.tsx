import type { Metadata } from 'next';
import LandingPage from './LandingPage';

// The marketing page is a client component (globe canvas, sandbox state), so
// its metadata lives here in a thin server wrapper. Without this it inherited
// the root layout's "TraceIQ Dashboard" title.
export const metadata: Metadata = {
  title: 'TraceIQ — See user journeys. Solve conversion friction.',
  description:
    'TraceIQ is a developer-first behavior intelligence platform. Track events, funnels, user timelines, feature flags, and errors through one telemetry SDK under 25 KB.',
  openGraph: {
    title: 'TraceIQ — See user journeys. Solve conversion friction.',
    description:
      'Developer-first behavior intelligence for web and mobile. Events, funnels, timelines, flags, and errors in one telemetry SDK under 25 KB.',
    type: 'website'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TraceIQ — See user journeys. Solve conversion friction.',
    description:
      'Developer-first behavior intelligence for web and mobile. Events, funnels, timelines, flags, and errors in one telemetry SDK under 25 KB.'
  }
};

export default function Page() {
  return <LandingPage />;
}
