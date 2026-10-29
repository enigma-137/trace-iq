'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import Globe02Icon from '@hugeicons/core-free-icons/Globe02Icon';
import { countryCode } from '@/lib/country-codes';

interface CountryFlagProps {
  /** ISO alpha-2 code ("NG") or a country name ("Nigeria"). */
  country: string | null | undefined;
  /** Height in px; flags are 3:2. */
  size?: number;
  className?: string;
}

/**
 * SVG flag served from /flags (copied from country-flag-icons at build time).
 * Emoji flags render as two letters on Windows, so we don't rely on them.
 */
export function CountryFlag({ country, size = 12, className = '' }: CountryFlagProps) {
  const code = countryCode(country);
  const [failed, setFailed] = useState(false);
  const width = Math.round((size * 3) / 2);

  if (!code || failed) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center text-neutral-400 dark:text-slate-500 ${className}`} style={{ width }} aria-hidden="true">
        <HugeiconsIcon icon={Globe02Icon} size={size + 2} strokeWidth={1.8} />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static SVG from /public; next/image adds nothing here
    <img
      src={`/flags/${code}.svg`}
      alt=""
      width={width}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={`inline-block shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.08)] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.08)] ${className}`}
    />
  );
}
