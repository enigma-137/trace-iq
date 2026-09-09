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

interface Partner {
  name: string;
  href: string;
  subtitle?: string;
  logo: React.ComponentType<{ className?: string }>;
}

const PARTNERS: Partner[] = [
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
    name: 'Nuwell AI',
    href: 'https://www.nuwellai.com/',
    subtitle: 'Smart Calorie Intelligence',
    logo: NuwellLogo
  },
  {
    name: "Ashipa",
    href: 'https://ashipaelectric.com/',
    subtitle: 'Renewable & Microgrid Systems',
    logo: AshipaLogo
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
