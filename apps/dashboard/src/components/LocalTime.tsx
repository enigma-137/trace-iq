'use client';

import { useEffect, useState } from 'react';

/**
 * Renders a timestamp in the viewer's local time zone.
 *
 * The server renders in UTC, so formatting during render makes the server and
 * client markup disagree (React hydration errors #418/#422/#425). This renders
 * a placeholder on the server and during hydration, then formats after mount.
 */
export function LocalTime({
  value,
  options,
  fallback = '—',
  className
}: {
  value?: string | null;
  options: Intl.DateTimeFormatOptions;
  fallback?: string;
  className?: string;
}) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    setText(formatLocal(value, options));
    // `options` is usually an inline literal; key on its contents instead of identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, JSON.stringify(options)]);

  const date = value ? new Date(value) : null;
  const iso = date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {text ?? (value ? ' ' : fallback)}
    </time>
  );
}

export function formatLocal(value: string | null | undefined, options: Intl.DateTimeFormatOptions): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', options).format(date);
}
