'use client';

import React from 'react';

const ARCHITECTURE_ITEMS = [
  {
    title: 'Self-hosted',
    subtitle: 'your infrastructure',
    description: 'Deploy on your own infrastructure with complete data sovereignty and zero third-party lock-in.',
    image: '/landing/section2 (1).png',
    centerBadge: 'Self-hosted',
  },
  {
    title: 'PostgreSQL',
    subtitle: 'portable event data',
    description: 'Portable, queryable event data stored in standard Postgres tables without proprietary silos.',
    image: '/landing/section2 (2).png',
    centerBadge: 'PostgreSQL',
  },
  {
    title: 'Optional auth',
    subtitle: 'local or Supabase',
    description: 'Flexible authentication supporting local accounts, Supabase Auth, or headless deployment.',
    image: '/landing/section2 (3).png',
    centerBadge: 'Optional Auth',
  },
];

export function LandingArchitectureCards() {
  return (
    <section className="w-full bg-[#f3f2ee] text-[#111111] py-20 sm:py-28 lg:py-32 transition-colors">
      <div className="w-full max-w-[1880px] mx-auto px-6 sm:px-10 lg:px-14 xl:px-20 2xl:px-24">

        {/* Top Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-12 sm:pb-16 border-b border-black/[0.08]">
          <span className="text-xs sm:text-sm font-medium tracking-wide text-neutral-500 uppercase font-mono">
            For developers
          </span>
          <p className="text-lg sm:text-xl md:text-2xl font-semibold text-neutral-900 tracking-tight max-w-[580px] leading-snug">
            Learn more on how engineering teams deploy TraceIQ to capture, query, and scale telemetry on their own terms.
          </p>
        </div>

        {/* Three Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10 pt-10 sm:pt-12">
          {ARCHITECTURE_ITEMS.map((item, idx) => (
            <div key={idx} className="flex flex-col gap-4 group">
              {/* Image Frame */}
              <div className="relative aspect-[16/10.5] w-full overflow-hidden rounded-xl sm:rounded-2xl border border-black/10 bg-neutral-200 shadow-sm transition-transform duration-300 group-hover:scale-[1.015]">
                <img
                  src={encodeURI(item.image)}
                  alt={`${item.title} - ${item.subtitle}`}
                  className="w-full h-full object-cover object-center blur-sm"
                  loading="lazy"
                />


                {/* Subtle dark tint for center overlay */}
                <div className="absolute inset-0 bg-black/25 transition-opacity duration-300 group-hover:bg-black/20" />

                {/* Centered Graphic Wordmark / Label */}
                <div className="absolute inset-0 flex items-center justify-center p-4 select-none">
                  <span className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.6)]">
                    {item.centerBadge}
                  </span>
                </div>
              </div>

              {/* Caption Under Image */}
              <div className="flex flex-col gap-1 text-left">
                <p className="text-sm sm:text-base font-normal text-neutral-800 leading-relaxed">
                  <strong className="font-semibold text-neutral-950">{item.title}:</strong> {item.subtitle.charAt(0).toUpperCase() + item.subtitle.slice(1)}. {item.description}
                </p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
