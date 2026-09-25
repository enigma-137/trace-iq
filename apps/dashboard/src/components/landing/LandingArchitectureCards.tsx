'use client';

import React from 'react';
import Image from 'next/image';

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
    <section className="panel">
      <div className="w-full">

        {/* Top Header Row */}
        <div className="panel-head">
          <h2 className="display-sm">
            Built to run
            <em>on your terms.</em>
          </h2>
          <p>
            Engineering teams deploy TraceIQ to capture, query and scale telemetry
            without handing their event data to anyone else.
          </p>
        </div>

        {/* Three Cards Grid */}
        <div className="panel-body grid grid-cols-1 gap-6 md:grid-cols-3 lg:gap-8">
          {ARCHITECTURE_ITEMS.map((item, idx) => (
            <article key={idx} className="arch-card group">
              <div className="arch-card-media">
                {/* next/image serves a sized WebP/AVIF instead of the ~2MB source PNG. */}
                <Image
                  src={item.image}
                  alt=""
                  fill
                  sizes="(max-width: 768px) 100vw, 33vw"
                  quality={70}
                  className="object-cover object-center"
                />
                <span className="arch-card-tint" />
                <span className="arch-card-index">{String(idx + 1).padStart(2, '0')}</span>
                <h3>{item.centerBadge}</h3>
              </div>

              <div className="arch-card-copy">
                <dt>{item.subtitle}</dt>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>

      </div>
    </section>
  );
}
