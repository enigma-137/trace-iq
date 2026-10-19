'use client';

import React from 'react';

// Crisp vector icon for Ashipa (interlocking Valknut triangles)
export function AshipaLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      {/* 3 interlocking triangles (Valknut) geometry */}
      <path
        d="M 50 12 L 67 41.5 L 61 52 L 50 33 L 34 60.7 L 50 88.5 L 42 88.5 L 26 60.7 Z"
      />
      <path
        d="M 74 54 L 90 81.5 L 74 81.5 L 63 62.5 L 47 90 L 39 90 L 58 57 L 52 46.5 Z"
      />
      <path
        d="M 26 54 L 32 43.5 L 51 76.5 L 43 90 L 27 62.5 L 10 90 L 2 90 L 21 57 Z"
      />
    </svg>
  );
}

// Crisp vector icon for Nuwell (emblem with twin health leaves)
export function NuwellLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="50" cy="50" r="46" fill="currentColor" fillOpacity="0.15" />
      <circle cx="50" cy="50" r="46" stroke="currentColor" strokeWidth="6" fill="none" />
      {/* Main leaf */}
      <path
        d="M 44 26 C 28 38 28 66 48 72 C 52 56 58 40 44 26 Z"
        fill="currentColor"
      />
      {/* Secondary accent leaf */}
      <path
        d="M 50 44 C 44 54 48 68 64 68 C 68 56 62 48 50 44 Z"
        fill="currentColor"
      />
    </svg>
  );
}

// Crisp vector icon for FUNAAB Life (academic mortarboard & campus emblem)
export function FunaabLifeLogo({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      fill="currentColor"
      aria-hidden="true"
    >
      {/* Mortarboard cap diamond top */}
      <path
        d="M 50 18 L 92 37 L 50 56 L 8 37 Z"
      />
      {/* Cap skull bowl */}
      <path
        d="M 23 48 L 23 64 C 23 75 77 75 77 64 L 77 48 C 69 54 59.8 57.5 50 57.5 C 40.2 57.5 31 54 23 48 Z"
      />
      {/* Hanging tassel cord and fringe */}
      <path
        d="M 85 41 L 85 67 C 82.5 68 81 70.5 81 73.5 C 81 77 83.5 79.5 86.5 79.5 C 89.5 79.5 92 77 92 73.5 C 92 70.5 90.5 68 88 67 L 88 40 Z"
      />
      {/* Center cap button */}
      <circle cx="50" cy="37" r="3.5" />
    </svg>
  );
}

export interface Partner {
  name: string;
  href: string;
  subtitle?: string;
  logo: React.ComponentType<{ className?: string }>;
}

export const PARTNERS: Partner[] = [
  {
    name: 'Nuwell',
    href: 'https://www.nuwellai.com/',
    subtitle: 'AI Health & Nutrition',
    logo: NuwellLogo
  },
  {
    name: 'Ashipa Electric',
    href: 'https://ashipaelectric.com/',
    subtitle: 'Clean Distributed Energy',
    logo: AshipaLogo
  },
  {
    name: 'FUNAAB Life',
    href: 'https://funaab-life.pages.dev/',
    subtitle: 'The Campus Is Online',
    logo: FunaabLifeLogo
  }
];

export function TrustedTeamsSection() {
  return (
    <section
      aria-label="Trusted by teams"
      className="trusted-section w-full border-y border-white/[0.07] bg-white/[0.015] backdrop-blur-xs"
    >
      <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-6 px-5 py-5 sm:px-8 md:flex-row md:gap-8 md:py-6">
        {/* Label */}
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-zinc-400 sm:text-xs">
            Trusted by teams at
          </span>
        </div>

        {/* Brand logos / items row */}
        <div className="flex flex-wrap items-center justify-center gap-6 sm:gap-10 md:justify-end md:gap-12">
          {PARTNERS.map((partner, index) => {
            const Logo = partner.logo;
            return (
              <a
                key={`${partner.name}-${index}`}
                href={partner.href}
                target="_blank"
                rel="noopener noreferrer"
                title={`${partner.name} - ${partner.subtitle || 'Visit website'}`}
                className="group flex items-center gap-2.5 text-zinc-400 transition-all duration-200 hover:text-white hover:scale-[1.03] active:scale-[0.98]"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center text-zinc-400 transition-colors duration-200 group-hover:text-white">
                  <Logo className="h-5 w-5" />
                </div>
                <span className="text-sm font-semibold tracking-tight text-zinc-300 transition-colors duration-200 group-hover:text-white sm:text-[15px]">
                  {partner.name}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default TrustedTeamsSection;
