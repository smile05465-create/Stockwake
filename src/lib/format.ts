/** Pure formatting helpers used across the UI. */

/** Format a price with 2 decimals (or more for sub-dollar prices). */
export function formatPrice(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 1 ? 4 : 2;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Format a signed percent, e.g. "+0.35%" / "-0.81%". */
export function formatPercent(value: number | null | undefined, digits = 2): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** Format a signed absolute change, e.g. "+1.14" / "-2.70". */
export function formatChange(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatPrice(value)}`;
}

/** Compact large numbers: 4.82T, 36.3M, 221.7K. */
export function formatCompact(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(0);
}

/** Full volume with commas, e.g. "36,306,347". */
export function formatVolume(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return Math.round(value).toLocaleString("en-US");
}

/** Human short date: "Oct 1, 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
