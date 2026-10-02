/** Markets dashboard: indices, movers, watchlist snapshot, news. */

import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { fetchCnbcQuotes, fetchMarketNews, fetchMovers, fetchQuote } from "../lib/api";
import type { CnbcQuote, MoversTab } from "../lib/api";
import type { Mover, NewsItem, Quote } from "../lib/types";
import { useAsync } from "../hooks/useAsync";
import { useWatchlist } from "../hooks/useWatchlist";
import MoversTable from "../components/MoversTable";
import NewsList from "../components/NewsList";
import QuoteCard from "../components/QuoteCard";
import { formatPercent, formatPrice } from "../lib/format";

const INDICES = [".SPX", ".DJI", "IXIC", ".VIX", "RUT"];

function IndexStrip() {
  const { data, error, loading } = useAsync<CnbcQuote[]>(() => fetchCnbcQuotes(INDICES), []);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-down">
        Couldn’t load index quotes. <button type="button" className="underline" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
      {(data ?? INDICES.map(() => null)).map((q, i) => {
        const fallback = INDICES[i];
        if (!q) {
          return (
            <div key={fallback} className="card p-3.5 animate-pulse">
              <div className="h-3 w-16 bg-ink-700 rounded" />
              <div className="h-6 w-24 bg-ink-700 rounded mt-2" />
            </div>
          );
        }
        const up = q.changePct > 0;
        const flat = q.changePct === 0;
        return (
          <Link
            key={q.symbol}
            to={`/symbol/${encodeURIComponent(q.symbol)}`}
            className="card card-hover p-3.5"
          >
            <div className="text-xs font-medium text-slate-400 truncate">{q.name}</div>
            <div className="mt-1 num text-xl font-semibold text-slate-100">
              {formatPrice(q.price)}
            </div>
            <div className={`num text-xs mt-0.5 ${flat ? "text-slate-400" : up ? "text-up" : "text-down"}`}>
              {formatPercent(q.changePct)} · {q.change > 0 ? "+" : ""}
              {formatPrice(q.change)}
              {loading && <span className="ml-1 text-flare-400">•</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function WatchlistSnapshot() {
  const { symbols, toggle } = useWatchlist();

  const loader = useCallback(async () => {
    const [saResults, cb] = await Promise.all([
      // allSettled: a single bad ticker must not fail the whole panel.
      Promise.allSettled(symbols.map((s) => fetchQuote(s))),
      fetchCnbcQuotes(symbols).catch(() => [] as CnbcQuote[]),
    ]);
    // CNBC may reorder or drop rows — key by symbol, never by position.
    const batchBySymbol = new Map(cb.map((q) => [q.symbol.toUpperCase(), q]));
    // Merge: SA gives extended-session detail, CNBC gives market cap/name.
    return symbols.map((s, i) => {
      const settled = saResults[i];
      const sa = settled?.status === "fulfilled" ? settled.value : null;
      const cbq = batchBySymbol.get(s.toUpperCase());
      if (sa && cbq) return { ...sa, name: cbq.name, marketCap: cbq.marketCap } as Quote;
      if (sa) return sa;
      if (cbq) return cbq as unknown as Quote;
      return null;
    });
  }, [symbols]);

  const { data, error, loading } = useAsync<(Quote | null)[]>(loader, [symbols.join(",")]);
  const quotes = (data ?? []).filter((q): q is Quote => q !== null);

  return (
    <section className="card p-4 sm:p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-slate-100">Your watchlist</h2>
        <Link to="/watchlist" className="text-xs text-flare-400 hover:text-flare-300">
          Manage →
        </Link>
      </div>

      {error && <p className="text-sm text-down py-4">Couldn’t load watchlist quotes.</p>}
      {loading && quotes.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-lg bg-ink-850 h-24 animate-pulse" />
          ))}
        </div>
      )}
      {!loading && !error && quotes.length === 0 && (
        <p className="text-sm text-slate-500 py-4">
          Watchlist is empty — search a ticker above or{" "}
          <Link to="/markets" className="text-flare-400 underline">
            browse markets
          </Link>
          .
        </p>
      )}
      {quotes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {quotes.map((q) => (
            <QuoteCard key={q.symbol} quote={q} remove={() => toggle(q.symbol)} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function Markets() {
  const [tab, setTab] = useState<MoversTab>("gainers");
  const movers = useAsync<Mover[]>(() => fetchMovers(tab), [tab]);
  const news = useAsync<NewsItem[]>(() => fetchMarketNews(), []);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">Markets</h1>
          <p className="text-sm text-slate-500 mt-1">
            Indices, movers, your watchlist and headlines — live.
          </p>
        </div>
        <span className="hidden sm:block text-xs text-slate-600 num">
          {new Date().toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>

      <IndexStrip />

      {/* Two-pane from `md` (tablet); stacked on phones. */}
      <div className="grid md:grid-cols-5 gap-6 items-start">
        <div className="md:col-span-3 space-y-6">
          <MoversTable
            tab={tab}
            onTabChange={setTab}
            movers={movers.data}
            loading={movers.loading}
            error={movers.error}
          />
          <WatchlistSnapshot />
        </div>
        <div className="md:col-span-2">
          <NewsList news={news.data} loading={news.loading} error={news.error} />
        </div>
      </div>
    </div>
  );
}
