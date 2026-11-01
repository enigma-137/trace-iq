/**
 * A share of a total as text. Whole numbers in the middle, but never hiding a small share
 * behind "0%" or a near-total one behind "100%": 0.4% reads "0.4%", 99.6% reads "99.6%",
 * and only a true 100% reads "100%".
 */
export function formatShare(value: number, total: number): string {
  if (!(total > 0) || !(value > 0)) return '0%';
  const share = (value / total) * 100;
  if (share >= 100) return '100%';
  if (share < 0.1) return '<0.1%';
  if (share < 1 || share > 99) {
    // Capped so a share just under 100 can't round up to "100%".
    const rounded = Math.min(99.9, Math.round(share * 10) / 10);
    return `${rounded}%`;
  }
  return `${Math.round(share)}%`;
}
