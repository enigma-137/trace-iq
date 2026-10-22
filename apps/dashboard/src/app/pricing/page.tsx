import type { Metadata } from 'next';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import { PRO_PRICE, PRO_YEARLY_PER_MONTH_USD, formatUsd } from '@/lib/pricing';
import { PricingClientView } from './PricingClientView';

const description = `Self-host TraceIQ for free, or choose managed TraceIQ Cloud Pro for ${formatUsd(PRO_PRICE.monthlyUsd)}/month or ${formatUsd(PRO_PRICE.yearlyUsd)}/year (${formatUsd(PRO_YEARLY_PER_MONTH_USD)}/month).`;

export const metadata: Metadata = {
  title: 'Pricing · TraceIQ',
  description,
  openGraph: {
    title: 'Pricing · TraceIQ',
    description
  }
};

export default function PricingPage() {
  return (
    <LandingSiteChrome>
      <PricingClientView />
    </LandingSiteChrome>
  );
}
