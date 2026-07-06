import './globals.css';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata = {
  title: 'TraceIQ | Developer-First Behavior Intelligence',
  description: 'Understand user behavior, conversion friction, and product journeys in real-time. Built for fintech, SaaS, and growth-stage startups.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=5',
  themeColor: '#09090b',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} dark`}>
      <body className="font-sans antialiased bg-zinc-950 text-zinc-50 min-h-screen">
        {children}
      </body>
    </html>
  );
}

