/** Whole-number percentage, or null when there is nothing to divide by. */
export function percent(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part / whole) * 100) : null;
}

/** "45 min", "3.2 h", "2.1 days". */
export function formatDuration(hours: number | null): string {
  if (hours === null) return '–';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  if (hours < 48) return `${hours.toFixed(1).replace(/\.0$/, '')} h`;
  return `${(hours / 24).toFixed(1).replace(/\.0$/, '')} days`;
}
