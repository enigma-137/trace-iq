import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { DemoShell } from './DemoShell';

export const metadata: Metadata = {
  title: 'Live demo',
  description: 'Explore a TraceIQ dashboard with sample data shaped like your company: traffic, funnels and API requests.'
};

export default function DemoLayout({ children }: { children: ReactNode }) {
  return <DemoShell>{children}</DemoShell>;
}
