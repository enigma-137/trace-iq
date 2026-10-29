import type { Metadata } from 'next';
import { DemoFunnels } from '../DemoFunnels';

export const metadata: Metadata = {
  title: 'Live demo · Funnels'
};

export default function DemoFunnelsPage() {
  return <DemoFunnels />;
}
