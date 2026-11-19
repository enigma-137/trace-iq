import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LandingSiteChrome } from '@/components/landing/LandingSiteChrome';
import { UnsubscribeForm } from './UnsubscribeForm';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  description: 'Stop getting TraceIQ product-update emails.',
  robots: { index: false, follow: false }
};

export default function UnsubscribePage() {
  return (
    <LandingSiteChrome>
      <Suspense>
        <UnsubscribeForm />
      </Suspense>
    </LandingSiteChrome>
  );
}
