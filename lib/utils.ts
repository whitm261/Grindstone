/**
 * Format an ISO date string as a human-readable relative label.
 * e.g. "today", "yesterday", "3d ago", "2w ago", "1mo ago"
 */
export function formatRelDate(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

/**
 * Format a single set as "8×135" or "8 reps" (for bodyweight exercises where weight = 0).
 * Omits the trailing ".0" for whole-number weights.
 */
export function fmtSet(s: { reps: number; weight: number }): string {
  const w = Number.isInteger(s.weight) ? String(s.weight) : s.weight.toFixed(1);
  return s.weight > 0 ? `${s.reps}×${w}` : `${s.reps} reps`;
}
