'use client';

import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import ComputerIcon from '@hugeicons/core-free-icons/ComputerIcon';
import SmartPhone01Icon from '@hugeicons/core-free-icons/SmartPhone01Icon';
import Tablet01Icon from '@hugeicons/core-free-icons/Tablet01Icon';
import Link01Icon from '@hugeicons/core-free-icons/Link01Icon';
import HelpCircleIcon from '@hugeicons/core-free-icons/HelpCircleIcon';
import { isDarkHex, letterIcon, resolveIcon } from '@/lib/brand-icons';

const DEVICE_ICONS = { desktop: ComputerIcon, mobile: SmartPhone01Icon, tablet: Tablet01Icon };

interface BrandIconProps {
  /** What the row shows: a browser, OS, device or source name, or a domain. */
  label: string;
  /** The site the row is about, when it differs from the label. */
  domain?: string | null;
  size?: number;
  className?: string;
}

/** Logo for a browser, OS, device or referrer; decorative, so hidden from screen readers. */
export function BrandIcon({ label, domain, size = 16, className = '' }: BrandIconProps) {
  const icon = resolveIcon(label, domain);
  const [faviconFailed, setFaviconFailed] = useState(false);
  const box = `inline-flex shrink-0 items-center justify-center ${className}`;

  if (icon.kind === 'glyph') {
    const dark = isDarkHex(icon.glyph.hex);
    return (
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden="true"
        // Near-black logos follow the text color so they stay visible in dark mode.
        className={`${box} ${dark ? 'text-neutral-900 dark:text-slate-100' : ''}`}
        fill={dark ? 'currentColor' : `#${icon.glyph.hex}`}
      >
        <path d={icon.glyph.path} />
      </svg>
    );
  }

  if (icon.kind === 'device' || icon.kind === 'direct' || icon.kind === 'unknown') {
    return (
      <span className={`${box} text-neutral-500 dark:text-slate-400`} aria-hidden="true">
        <HugeiconsIcon
          icon={icon.kind === 'direct' ? Link01Icon : icon.kind === 'unknown' ? HelpCircleIcon : DEVICE_ICONS[icon.device]}
          size={size}
          strokeWidth={1.8}
        />
      </span>
    );
  }

  if (icon.kind === 'favicon' && !faviconFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tiny same-origin icon; next/image adds nothing here
      <img
        src={`/api/favicon?domain=${encodeURIComponent(icon.domain)}`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFaviconFailed(true)}
        className={`${box} rounded-sm object-contain`}
      />
    );
  }

  const letter = icon.kind === 'letter' ? icon : letterIcon(label);
  return (
    <span
      aria-hidden="true"
      className={`${box} rounded font-semibold leading-none text-white`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.6), background: `hsl(${letter.hue} 55% 45%)` }}
    >
      {letter.letter}
    </span>
  );
}
