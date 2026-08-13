import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { DM_Sans, IBM_Plex_Mono } from 'next/font/google';
import { PendingInviteRestorer } from '@/components/PendingInviteRestorer';

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-dm-sans',
  display: 'swap'
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-ibm-plex-mono',
  display: 'swap'
});

export const metadata: Metadata = {
  metadataBase: new URL('https://traceiq.run'),

  title: {
    default: 'TraceIQ — Product Analytics That Drives Real Growth',
    template: '%s | TraceIQ'
  },

  description:
    'Privacy-first product analytics for events, funnels, users, retention, revenue, and errors.',

  icons: {
    icon: '/favicon.ico'
  },

  openGraph: {
    title: 'TraceIQ — Data That Drives Real Growth',
    description: 'Simple, powerful, privacy-first product analytics.',
    url: 'https://traceiq.run',
    siteName: 'TraceIQ',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'TraceIQ — Data that drives real growth'
      }
    ]
  },

  twitter: {
    card: 'summary_large_image',
    title: 'TraceIQ — Data That Drives Real Growth',
    description: 'Simple, powerful, privacy-first product analytics.',
    images: ['/og.png']
  }
};

const themeScript = `
(() => {
  try {
    const stored = localStorage.getItem('traceiq-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored ?? (prefersDark ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
  }
})();
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${dmSans.variable} ${ibmPlexMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        {children}
        <PendingInviteRestorer />
      </body>
    </html>
  );
}
