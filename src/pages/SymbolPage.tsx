/** Symbol detail: quote header, chart with range switcher, stats, news. */

import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  fetchCnbcQuotes,
  fetchHistory,
  fetchQuote,
  fetchSymbolNews,
  keyStatsFrom,
  sessionBars,
} from "../lib/api";
import type { CnbcQuote } from "../lib/api";
import type { Bar, ChartRange, KeyStats, NewsItem, Quote } from "../lib/types";
import { useAsync } from "../hooks/useAsync";
import { useWatchlist } from "../hooks/useWatchlist";
import NewsList from "../components/NewsList";
import PriceChart from "../components/PriceChart";
import {
  formatChange,
  formatCompact,
  formatDate,
  formatPercent,
  formatPrice,
  formatVolume,
} from "../lib/format";

const RANGES: ChartRange[] = ["1D", "1W", "1M", "3M", "1Y", "5Y"];

interface QuoteBundle {
  quote: Quote;
  stats: KeyStats | null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-ink-800 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className="num text-sm text-slate-200 text-right">{value}</span>
    </div>
  );
}

function num(v: number | null | undefined, suffix = ""): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${formatPrice(v)}${suffix}`;
}

export default function SymbolPage() {
  const params = useParams();
  // Normalize the route param so hand-typed URLs (/symbol/aapl) resolve too.
  const symbol = (params.symbol ?? "").trim().toUpperCase();
  const [range, setRange] = useState<ChartRange>("1M");
  const { symbols, toggle } = useWatchlist();
  const watched = symbols.includes(symbol);

  const quoteLoader = useCallback(async (): Promise<QuoteBundle | null> => {
    const [sa, cb] = await Promise.all([
      // SA answers 404/400 for indices (.SPX, IXIC…) — never let it break the page.
      fetchQuote(symbol).catch(() => null),
      fetchCnbcQuotes([symbol]).catch(() => [] as CnbcQuote[]),
    ]);
    const batch = cb[0];
    if (sa) {
      return {
        quote: {
          ...sa,
          name: batch?.name ?? sa.name,
          marketCap: batch?.marketCap ?? sa.marketCap,
          high52w: sa.high52w ?? batch?.high52w ?? null,
          low52w: sa.low52w ?? batch?.low52w ?? null,
        },
        stats: batch ? keyStatsFrom(batch) : null,
      };
    }
    if (batch) return { quote: batch as unknown as Quote, stats: keyStatsFrom(batch) };
    return null;
  }, [symbol]);

  const quoteState = useAsync<QuoteBundle | null>(quoteLoader, [symbol]);
  const historyState = useAsync<Bar[]>(() => fetchHistory(symbol, range), [symbol, range]);
  const newsState = useAsync<NewsItem[]>(() => fetchSymbolNews(symbol), [symbol]);

  const bundle = quoteState.data;
  const quote = bundle?.quote ?? null;
  const stats = bundle?.stats ?? null;
  const rawBars = historyState.data ?? [];
  // 1D is the last trading session (live quote merged in); other ranges are
  // the trimmed daily series straight from the provider.
  const bars = range === "1D" ? sessionBars(rawBars, quote) : rawBars;

  const first = bars[0]?.c ?? quote?.price ?? 0;
  const last = bars[bars.length - 1]?.c ?? quote?.price ?? 0;
  const rangeChangePct = first > 0 ? ((last - first) / first) * 100 : 0;

  // Real, derived facts for the selected range — never fabricated.
  const periodHigh = bars.length > 0 ? Math.max(...bars.map((b) => b.h)) : null;
  const periodLow = bars.length > 0 ? Math.min(...bars.map((b) => b.l)) : null;
  // Where the latest price sits inside the 52-week range (0–100%).
  const range52Pos =
    quote && quote.high52w != null && quote.low52w != null && quote.high52w > quote.low52w
      ? Math.min(
          100,
          Math.max(0, ((quote.price - quote.low52w) / (quote.high52w - quote.low52w)) * 100),
        )
      : null;

  if (quoteState.error && !bundle) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 text-center">
        <p className="text-lg text-down">Couldn’t load “{symbol}”.</p>
        <p className="mt-2 text-sm text-slate-500 break-words">{quoteState.error.message}</p>
        <button
          type="button"
          onClick={quoteState.reload}
          className="mt-4 rounded-lg bg-flare-500 text-ink-950 font-semibold px-4 py-2"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="num text-3xl font-semibold text-slate-50">{symbol.toUpperCase()}</h1>
            {quote?.session && (
              <span
                className={`text-[11px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  quote.session === "open"
                    ? "border-up/40 text-up bg-emerald-500/10"
                    : quote.session === "pre" || quote.session === "post"
                      ? "border-flare-500/40 text-flare-400 bg-flare-500/10"
                      : "border-ink-600 text-slate-400 bg-ink-850"
                }`}
              >
                {quote.session === "open"
                  ? "Market open"
                  : quote.session === "pre"
                    ? "Pre-market"
                    : quote.session === "post"
                      ? "After hours"
                      : "Market closed"}
              </span>
            )}
          </div>
          <p className="mt-1 text-slate-400">
            {quote?.name ?? (quoteState.loading ? "Loading…" : "Unknown symbol")}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              Volume{" "}
              <span className="num text-slate-300">
                {quote ? formatVolume(quote.volume) : "—"}
              </span>
            </span>
            <span>
              Market cap{" "}
              <span className="num text-slate-300">
                {quote?.marketCap != null ? formatCompact(quote.marketCap) : "—"}
              </span>
            </span>
            <span>
              Exchange <span className="text-slate-300">{quote?.exchange || "—"}</span>
            </span>
          </div>
        </div>

        <div className="text-left sm:text-right">
          <div className="flex sm:justify-end items-baseline gap-3">
            <span className="num text-4xl font-semibold text-slate-50">
              {quote ? formatPrice(quote.price) : "—"}
            </span>
            {quote && (
              <span
                className={`num text-lg ${
                  quote.changePct > 0
                    ? "text-up"
                    : quote.changePct < 0
                      ? "text-down"
                      : "text-slate-400"
                }`}
              >
                {formatPercent(quote.changePct)}
              </span>
            )}
          </div>
          {quote && (
            <p className="num text-sm text-slate-500 mt-1">
              {formatChange(quote.change)} vs prev. close
              {quote.date && <> · as of {formatDate(quote.date)}</>}
            </p>
          )}
          {quote?.extended && (
            <p className="num text-xs text-flare-400 mt-1">
              {quote.extended.label}: {formatPrice(quote.extended.price)} (
              {formatPercent(quote.extended.changePct)})
            </p>
          )}
          <div className="mt-3 flex sm:justify-end">
            <button
              type="button"
              onClick={() => toggle(symbol)}
              aria-pressed={watched}
              aria-label={
                watched
                  ? `Remove ${symbol} from watchlist`
                  : `Add ${symbol} to watchlist`
              }
              className={`text-sm font-semibold rounded-lg px-4 py-2 border transition-colors ${
                watched
                  ? "border-flare-500/60 text-flare-300 bg-flare-500/10 hover:bg-flare-500/20"
                  : "border-flare-500 bg-flare-500 text-ink-950 hover:bg-flare-400 hover:border-flare-400"
              }`}
            >
              {watched ? "★ Remove from Watchlist" : "☆ Add to Watchlist"}
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-5 gap-6 items-start">
        {/* Chart */}
        <div className="lg:col-span-3 card p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-slate-400">Price history</h2>
              {bars.length > 0 && (
                <p className="num text-xs text-slate-600 mt-0.5">
                  {range} ·{" "}
                  <span className={rangeChangePct >= 0 ? "text-up" : "text-down"}>
                    {formatPercent(rangeChangePct)}
                  </span>
                </p>
              )}
              {range === "1D" && bars.length > 0 && (
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Last session vs previous close · daily data
                </p>
              )}
              {range !== "1D" && periodHigh != null && periodLow != null && (
                <p className="num text-[11px] text-slate-600 mt-0.5">
                  Daily bars · period H {formatPrice(periodHigh)} – L {formatPrice(periodLow)}
                </p>
              )}
            </div>
            <div className="flex w-fit rounded-lg bg-ink-850 border border-ink-700 p-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  aria-pressed={range === r}
                  className={`px-3 py-2 sm:px-2 sm:py-1.5 lg:py-1 text-xs rounded-md transition-colors ${
                    range === r
                      ? "bg-flare-500 text-ink-950 font-semibold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {historyState.error && quote?.kind === "index" && (
            <div className="h-40 flex items-center justify-center text-sm text-slate-500 text-center px-4">
              Daily chart data isn’t available for this index from our data feeds — the quote
              and statistics above still load from public feeds.
            </div>
          )}
          {historyState.error && quote?.kind !== "index" && (
            <p className="text-sm text-down py-6 text-center break-words">
              Couldn’t load history — {historyState.error.message}{" "}
              <button type="button" className="underline" onClick={historyState.reload}>
                Retry
              </button>
            </p>
          )}
          {historyState.loading && bars.length === 0 && (
            <div className="h-72 rounded-lg bg-ink-850/60 animate-pulse" />
          )}
          {!historyState.loading && !historyState.error && bars.length === 0 && (
            <div className="h-40 flex items-center justify-center text-sm text-slate-500 text-center px-4">
              No chartable price history for {symbol} in this range. Quotes and statistics
              above are unaffected.
            </div>
          )}
          {!historyState.loading && bars.length > 0 && (
            <PriceChart bars={bars} positive={rangeChangePct >= 0} />
          )}
        </div>

        {/* Stats */}
        <div className="lg:col-span-2 space-y-6">
          <section className="card p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-100 mb-2">Key statistics</h2>
            <Stat label="Previous close" value={quote ? num(quote.previousClose) : "—"} />
            <Stat label="Day range" value={quote ? `${num(quote.low)} – ${num(quote.high)}` : "—"} />
            <Stat
              label="52-week range"
              value={quote ? `${num(quote.low52w)} – ${num(quote.high52w)}` : "—"}
            />
            {range52Pos != null && (
              <div
                className="py-2 border-b border-ink-800"
                role="img"
                aria-label={`${Math.round(range52Pos)}% of the 52-week range`}
              >
                <div className="relative h-1.5 rounded-full bg-ink-700">
                  <span
                    className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-flare-400"
                    style={{ left: `${range52Pos}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-baseline justify-between gap-2 text-[11px] text-slate-500">
                  <span className="num">{num(quote?.low52w)}</span>
                  <span className="num text-flare-400">
                    {Math.round(range52Pos)}% of 52W range
                  </span>
                  <span className="num">{num(quote?.high52w)}</span>
                </div>
              </div>
            )}
            <Stat label="Volume" value={quote ? formatVolume(quote.volume) : "—"} />
            <Stat
              label="Market cap"
              value={quote?.marketCap != null ? formatCompact(quote.marketCap) : "—"}
            />
            <Stat label="Currency" value={quote?.currency || "—"} />
            <Stat label="P/E ratio" value={stats ? num(stats.pe) : "—"} />
            <Stat label="EPS (TTM)" value={stats ? num(stats.eps) : "—"} />
            <Stat
              label="Dividend yield"
              value={stats && stats.dividendYield != null ? `${stats.dividendYield.toFixed(2)}%` : "—"}
            />
            <Stat label="Beta (1Y)" value={stats ? num(stats.beta) : "—"} />
            <Stat
              label="Revenue (TTM)"
              value={stats?.revenueTtm != null ? `$${formatCompact(stats.revenueTtm)}` : "—"}
            />
            <Stat
              label="ROE"
              value={stats && stats.roe != null ? `${stats.roe.toFixed(2)}%` : "—"}
            />
            <Stat label="Next earnings" value={stats?.nextEarnings ?? "—"} />
          </section>

          <NewsList
            news={newsState.data}
            loading={newsState.loading}
            error={newsState.error}
            onRetry={newsState.reload}
            title={`News for ${symbol.toUpperCase()}`}
            emptyText="No recent headlines for this symbol."
          />
        </div>
      </div>

      <p className="text-xs text-slate-600">
        <Link to="/markets" className="hover:text-flare-400">
          ← Back to markets
        </Link>
      </p>
    </div>
  );
}
