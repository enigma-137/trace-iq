import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'TraceIQ Dashboard',
  description: 'Behavior intelligence dashboard for product teams.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
