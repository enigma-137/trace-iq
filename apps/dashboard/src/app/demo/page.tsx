import type { Metadata } from 'next';
import { DemoOverview } from './DemoOverview';

export const metadata: Metadata = {
  title: 'Live demo · Overview'
};

export default function DemoOverviewPage() {
  return <DemoOverview />;
}
