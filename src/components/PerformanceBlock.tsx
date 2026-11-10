import { formatPercent } from "../lib/format";
import type { PerformanceProfile } from "../lib/api";

/**
 * Fallback for the chart when daily history cannot be loaded: the returns the
 * symbol has actually produced over each range, plus its 52-week position.
 * Deliberately not drawn as a line — these are numbers, not a price series,
 * and drawing them would imply data we do not have.
 */
export default function PerformanceBlock({
  profile,
  price,
}: {
  profile: PerformanceProfile;
  price: number | null;
}) {
  const all: Array<[string, number | null]> = [
    ["1 week", profile.w],
    ["1 month", profile.m1],
    ["3 months", profile.m3],
    ["6 months", profile.m6],
    ["This year", profile.ytd],
    ["1 year", profile.y1],
    ["5 years", profile.y5],
  ];
  const rows: Array<[string, number]> = all.flatMap(([label, value]) =>
    value === null ? [] : [[label, value] as [string, number]],
  );

  const { high52, low52 } = profile;
  const hasRange = high52 !== null && low52 !== null && high52 > low52;
  const position =
    hasRange && price !== null
      ? Math.min(1, Math.max(0, (price - low52!) / (high52! - low52!)))
      : null;

  if (rows.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-ink-700 bg-ink-850/60 px-3 py-2">
            <div className="text-[11px] text-slate-500">{label}</div>
            <div
              className={`num text-sm font-semibold ${
                value > 0 ? "text-up" : value < 0 ? "text-down" : "text-slate-300"
              }`}
            >
              {formatPercent(value)}
            </div>
          </div>
        ))}
      </div>

      {hasRange && (
        <div>
          <div className="flex justify-between text-[11px] text-slate-500 num mb-1">
            <span>{low52!.toFixed(2)}</span>
            <span className="uppercase tracking-wide text-slate-600">52-week range</span>
            <span>{high52!.toFixed(2)}</span>
          </div>
          <div className="relative h-1.5 rounded-full bg-ink-700">
            {position !== null && (
              <span
                className="absolute -top-1 h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-flare-400 shadow-[0_0_10px_rgba(251,146,60,0.7)]"
                style={{ left: `${position * 100}%` }}
                aria-hidden="true"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
