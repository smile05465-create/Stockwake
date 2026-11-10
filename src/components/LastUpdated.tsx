/** "Updated 12s ago" — tells the reader how fresh the numbers are. */
import { useEffect, useState } from "react";

export default function LastUpdated({
  at,
  refreshing,
  className = "",
}: {
  at: number | null;
  refreshing?: boolean;
  className?: string;
}) {
  const [, force] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);

  if (!at) return null;
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  const label =
    seconds < 20
      ? "just now"
      : seconds < 90
        ? `${seconds}s ago`
        : `${Math.round(seconds / 60)}m ago`;

  return (
    <span className={`text-[11px] text-slate-600 num ${className}`} title={new Date(at).toLocaleString()}>
      {refreshing ? "updating…" : `updated ${label}`}
    </span>
  );
}
