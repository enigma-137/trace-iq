// Shared metric formatting + period-over-period helpers used across dashboard pages.

const compactFmt = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function compactNumber(value: number): string {
  return compactFmt.format(value);
}

export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

export interface Delta {
  label: string;
  arrow: '' | '↑' | '↓';
  muted: boolean;
}

// Period-over-period change, expressed for a non-technical reader.
export function deltaInfo(current: number, previous: number): Delta {
  if (previous <= 0) {
    return { label: current > 0 ? 'new' : 'no change', arrow: '', muted: true };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(Math.abs(pct));
  if (rounded === 0) {
    return { label: 'no change', arrow: '', muted: true };
  }
  return { label: `${rounded}%`, arrow: pct > 0 ? '↑' : '↓', muted: false };
}

// Plain-language comparison sentence, e.g. "That's up from 104 the 30 days before."
export function comparisonText(days: number, previous: number, formattedPrevious: string, delta: Delta): string {
  if (previous <= 0) {
    return `No activity in the ${days} days before.`;
  }
  if (delta.muted) {
    return `That's about the same as ${formattedPrevious} the ${days} days before.`;
  }
  return `That's ${delta.arrow === '↑' ? 'up from' : 'down from'} ${formattedPrevious} the ${days} days before.`;
}
