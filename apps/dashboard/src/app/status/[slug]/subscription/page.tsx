import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SubscriptionAction } from './SubscriptionAction';

export const metadata: Metadata = {
  title: 'Status updates',
  robots: { index: false, follow: false }
};

export default function SubscriptionPage({ params }: { params: { slug: string } }) {
  return (
    <Suspense>
      <SubscriptionAction slug={params.slug} />
    </Suspense>
  );
}
