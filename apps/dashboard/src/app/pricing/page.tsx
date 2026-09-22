import type { Metadata } from 'next';
import { PublicPage } from '@/components/PublicSiteChrome';
import { PricingClientView } from './PricingClientView';

export const metadata: Metadata = {
  title: 'Pricing · TraceIQ',
  description: 'Simple, transparent pricing for developer-first behavior intelligence. Self-host for free or choose managed TraceIQ Cloud Pro for $19/mo.',
  openGraph: {
    title: 'Pricing · TraceIQ',
    description: 'Simple, transparent pricing for developer-first behavior intelligence. Self-host for free or choose managed TraceIQ Cloud Pro for $19/mo.'
  }
};

export default function PricingPage() {
  return (
    <PublicPage>
      <PricingClientView />
    </PublicPage>
  );
}
