/** Tabbed movers (gainers / losers / most active): compact cards on phones/tablets,
 *  the original table from `lg` up where it always fits without sideways scrolling. */

import { Link } from "react-router-dom";
import type { Mover } from "../lib/types";
import { formatCompact, formatPercent, formatPrice } from "../lib/format";

export type MoversTab = "gainers" | "losers" | "active";

interface Props {
  tab: MoversTab;
  onTabChange: (tab: MoversTab) => void;
  movers: Mover[] | null;
  loading: boolean;
  error: Error | null;
}

const TABS: Array<{ id: MoversTab; label: string }> = [
  { id: "gainers", label: "Gainers" },
  { id: "losers", label: "Losers" },
  { id: "active", label: "Most active" },
];

export default function MoversTable({ tab, onTabChange, movers, loading, error }: Props) {
  return (
    <section className="card p-4 sm:p-5">
      {/* Stacks the title above the tabs on phones; one row from sm up (desktop unchanged). */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-100">Market movers</h2>
        <div
          className="flex w-fit rounded-lg bg-ink-850 border border-ink-700 p-0.5"
          role="tablist"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={`px-3 py-2 sm:px-2.5 sm:py-1.5 lg:py-1 text-xs rounded-md transition-colors ${
                tab === t.id
                  ? "bg-flare-500 text-ink-950 font-semibold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="text-sm text-down py-6 text-center break-words">
          Couldn’t load movers: {error.message}
        </p>
      )}
      {loading && !movers && (
        <div className="py-10 text-center text-sm text-slate-500">Loading movers…</div>
      )}

      {/* Compact mobile/tablet cards — every datum from the table, no sideways scroll. */}
      {movers && (
        <ul className="lg:hidden -mx-1">
          {movers.length === 0 && (
            <li className="py-8 text-center text-sm text-slate-500">
              No movers matched the current filters.
            </li>
          )}
          {movers.map((m) => (
            <li key={m.symbol} className="border-b border-ink-800/70 last:border-0">
              <Link
                to={`/symbol/${encodeURIComponent(m.symbol)}`}
                className="flex items-center gap-3 px-1 py-3 min-h-[64px]
                           hover:bg-ink-850/40 active:bg-ink-850/70 transition-colors"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="num font-semibold text-slate-100">{m.symbol}</span>
                    <span className="min-w-0 truncate text-xs text-slate-500">{m.name}</span>
                  </div>
                  <div className="num text-[11px] text-slate-600 mt-0.5 truncate">
                    Vol {formatCompact(m.volume)}
                    {m.marketCap != null && <> · Cap {formatCompact(m.marketCap)}</>}
                    {m.exchange && <> · {m.exchange}</>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="num text-base font-semibold text-slate-100">
                    {formatPrice(m.price)}
                  </div>
                  <div
                    className={`num text-xs ${
                      m.changePct > 0
                        ? "text-up"
                        : m.changePct < 0
                          ? "text-down"
                          : "text-slate-400"
                    }`}
                  >
                    {formatPercent(m.changePct)}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/* Desktop / large tablet table — identical to the original design. */}
      {movers && (
        <div className="hidden lg:block overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[540px]">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b border-ink-700">
                <th className="py-2 px-1 font-medium">Symbol</th>
                <th className="py-2 px-1 font-medium text-right">Price</th>
                <th className="py-2 px-1 font-medium text-right">Change</th>
                <th className="py-2 px-1 font-medium text-right">Volume</th>
                <th className="py-2 px-1 font-medium text-right">Mkt cap</th>
              </tr>
            </thead>
            <tbody>
              {movers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    No movers matched the current filters.
                  </td>
                </tr>
              )}
              {movers.map((m) => (
                <tr
                  key={m.symbol}
                  className="border-b border-ink-800/70 last:border-0 hover:bg-ink-850/60 transition-colors"
                >
                  <td className="py-2.5 px-1">
                    <Link
                      to={`/symbol/${encodeURIComponent(m.symbol)}`}
                      className="num font-semibold text-slate-200 hover:text-flare-300 transition-colors"
                    >
                      {m.symbol}
                    </Link>
                    <div className="text-xs text-slate-500 truncate max-w-[220px]">{m.name}</div>
                  </td>
                  <td className="py-2.5 px-1 text-right num text-slate-300">
                    {formatPrice(m.price)}
                  </td>
                  <td
                    className={`py-2.5 px-1 text-right num font-medium ${
                      m.changePct > 0 ? "text-up" : m.changePct < 0 ? "text-down" : "text-slate-400"
                    }`}
                  >
                    {formatPercent(m.changePct)}
                  </td>
                  <td className="py-2.5 px-1 text-right num text-slate-400">
                    {formatCompact(m.volume)}
                  </td>
                  <td className="py-2.5 px-1 text-right num text-slate-400">
                    {m.marketCap != null ? formatCompact(m.marketCap) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
