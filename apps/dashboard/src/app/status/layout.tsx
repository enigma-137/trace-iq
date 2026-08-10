import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'TraceIQ System Status',
  description: 'Live status of the TraceIQ platform — API, ingestion, and database health.'
};

export default function StatusLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}