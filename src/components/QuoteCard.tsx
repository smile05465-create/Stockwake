/** Compact quote card used on landing, markets, and watchlist. */

import { Link } from "react-router-dom";
import type { Quote } from "../lib/types";
import { formatCompact, formatPercent, formatPrice } from "../lib/format";

interface Props {
  quote: Quote;
  /** Show exchange/cap subtitle line. */
  subtitle?: string;
  remove?: () => void;
}

export default function QuoteCard({ quote, subtitle, remove }: Props) {
  const up = quote.changePct > 0;
  const flat = quote.changePct === 0;
  const tone = flat ? "text-slate-300" : up ? "text-up" : "text-down";
  const chip = flat
    ? "bg-slate-500/15 text-slate-300"
    : up
      ? "bg-emerald-500/15 text-up"
      : "bg-rose-500/15 text-down";

  return (
    <div className="card card-hover p-4 relative group">
      <div className="flex items-start justify-between gap-2">
        <Link to={`/symbol/${encodeURIComponent(quote.symbol)}`} className="min-w-0">
          <div className="num font-semibold text-slate-100 group-hover:text-flare-300 transition-colors">
            {quote.symbol}
          </div>
          <div className="text-xs text-slate-500 truncate">{quote.name}</div>
        </Link>
        <span className={`text-xs num px-1.5 py-0.5 rounded ${chip}`}>
          {formatPercent(quote.changePct)}
        </span>
      </div>

      <div className="mt-3 flex items-end justify-between gap-2">
        <div className={`text-2xl num font-semibold ${tone}`}>{formatPrice(quote.price)}</div>
        <div className={`text-xs num ${tone}`}>
          {quote.change > 0 ? "+" : ""}
          {formatPrice(quote.change)}
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
        <span>{subtitle ?? quote.exchange}</span>
        {quote.marketCap != null && <span className="num">Cap {formatCompact(quote.marketCap)}</span>}
      </div>

      {remove && (
        <button
          type="button"
          onClick={remove}
          aria-label={`Remove ${quote.symbol} from watchlist`}
          className="absolute top-2 right-9 opacity-60 sm:opacity-0 sm:group-hover:opacity-100
                     focus:opacity-100 h-6 w-6 rounded-md text-slate-500 hover:text-down
                     hover:bg-ink-800 transition-all text-xs"
        >
          ✕
        </button>
      )}
    </div>
  );
}
