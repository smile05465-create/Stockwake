/** Full watchlist page: grid of quote cards with add/remove. */

import { useCallback, useState } from "react";
import { fetchCnbcQuotes, fetchMarketNews, fetchQuote, searchSymbols } from "../lib/api";
import type { CnbcQuote } from "../lib/api";
import type { NewsItem, Quote } from "../lib/types";
import { useAsync } from "../hooks/useAsync";
import { useWatchlist } from "../hooks/useWatchlist";
import NewsList from "../components/NewsList";
import QuoteCard from "../components/QuoteCard";
import { formatPercent, formatPrice } from "../lib/format";

function AddSymbol({ onAdd }: { onAdd: (symbol: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Array<{ symbol: string; name: string }> | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const lookup = useCallback(async () => {
    const term = q.trim();
    if (!term) return;
    setBusy(true);
    setFailed(false);
    try {
      const hits = await searchSymbols(term);
      setResults(hits.slice(0, 6));
      // Convenience: exact ticker match adds immediately.
      const exact = hits.find((h) => h.symbol.toUpperCase() === term.toUpperCase());
      if (exact) {
        onAdd(exact.symbol);
        setQ("");
        setResults(null);
      }
    } catch {
      // A failed request is not "no matches" — say so honestly.
      setResults([]);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }, [q, onAdd]);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setResults(null);
            setFailed(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void lookup();
            }
          }}
          placeholder="Add symbol, e.g. AMD"
          aria-label="Add symbol to watchlist"
          className="flex-1 rounded-lg bg-ink-850 border border-ink-600 px-3 py-2 text-sm
                     text-slate-100 placeholder:text-slate-500 outline-none
                     focus:border-flare-500/70 focus:ring-2 focus:ring-flare-500/20"
        />
        <button
          type="button"
          onClick={() => void lookup()}
          disabled={busy}
          className="rounded-lg bg-flare-500 hover:bg-flare-400 disabled:opacity-50 text-ink-950
                     font-semibold text-sm px-4 py-2 transition-colors"
        >
          {busy ? "…" : "Add"}
        </button>
      </div>

      {results && results.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-ink-600 bg-ink-900 shadow-2xl shadow-black/50 overflow-hidden">
          {results.map((r) => (
            <li key={r.symbol}>
              <button
                type="button"
                onClick={() => {
                  onAdd(r.symbol);
                  setQ("");
                  setResults(null);
                }}
                className="w-full text-left px-3 py-2.5 text-sm hover:bg-ink-850 flex gap-3 items-baseline"
              >
                <span className="num font-semibold text-flare-300">{r.symbol}</span>
                <span className="text-slate-400 truncate">{r.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {results && results.length === 0 && (
        <div className="absolute z-20 left-0 right-0 mt-1 rounded-xl border border-ink-600 bg-ink-900 px-3 py-2.5 text-sm text-slate-500">
          {failed ? "Search is unavailable right now — try again." : "No matches."}
        </div>
      )}
    </div>
  );
}

export default function Watchlist() {
  const { symbols, add, remove } = useWatchlist();

  const loader = useCallback(async () => {
    const [saResults, cb] = await Promise.all([
      // allSettled: one failing ticker must not blank the whole watchlist.
      Promise.allSettled(symbols.map((s) => fetchQuote(s))),
      fetchCnbcQuotes(symbols).catch(() => [] as CnbcQuote[]),
    ]);
    // Match CNBC rows by symbol — the batch may reorder or drop rows.
    const batchBySymbol = new Map(cb.map((q) => [q.symbol.toUpperCase(), q]));
    return symbols.map((s, i) => {
      const settled = saResults[i];
      const quote = settled?.status === "fulfilled" ? settled.value : null;
      const batch = batchBySymbol.get(s.toUpperCase());
      if (quote && batch) return { ...quote, name: batch.name, marketCap: batch.marketCap } as Quote;
      if (quote) return quote;
      if (batch) return batch as unknown as Quote;
      return null;
    });
  }, [symbols]);
  const { data, error, loading, reload } = useAsync<(Quote | null)[]>(loader, [
    symbols.join(","),
  ]);
  const quotes = (data ?? []).filter((q): q is Quote => q !== null);
  // Market headlines from the same keyless feed the dashboard uses.
  const news = useAsync<NewsItem[]>(() => fetchMarketNews(), []);

  // Summary strip derived from loaded quotes.
  const gainers = quotes.filter((q) => q.changePct > 0).length;
  const losers = quotes.filter((q) => q.changePct < 0).length;
  const leader = quotes.reduce<{ symbol: string; changePct: number } | null>((best, q) => {
    if (!best || q.changePct > best.changePct) return { symbol: q.symbol, changePct: q.changePct };
    return best;
  }, null);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-50 tracking-tight">Watchlist</h1>
          <p className="text-sm text-slate-500 mt-1">
            Saved in your browser — {symbols.length}/30 symbols.
          </p>
        </div>
        <div className="sm:max-w-sm w-full">
          <AddSymbol onAdd={add} />
        </div>
      </div>

      {quotes.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="card p-3">
            <div className="text-xs text-slate-500">Symbols</div>
            <div className="num text-lg font-semibold text-slate-100">{quotes.length}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500">Advancing</div>
            <div className="num text-lg font-semibold text-up">{gainers}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500">Declining</div>
            <div className="num text-lg font-semibold text-down">{losers}</div>
          </div>
          <div className="card p-3">
            <div className="text-xs text-slate-500">Leader</div>
            <div className="num text-lg font-semibold text-flare-300">
              {leader ? leader.symbol : "—"}
            </div>
            {leader && (
              <div className={`num text-xs ${leader.changePct >= 0 ? "text-up" : "text-down"}`}>
                {formatPercent(leader.changePct)} · {formatPrice(quotes.find((q) => q.symbol === leader.symbol)?.price)}
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-down">
          Couldn’t load quotes. Check your connection.{" "}
          <button type="button" className="underline" onClick={reload}>
            Retry
          </button>
        </div>
      )}

      {loading && quotes.length === 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="card h-28 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && symbols.length > 0 && quotes.length === 0 && !error && (
        <div className="card p-8 text-center text-sm text-slate-500">
          No quote data for these symbols right now.
        </div>
      )}

      {symbols.length === 0 && (
        <div className="card p-8 text-center text-sm text-slate-500">
          Your watchlist is empty. Search above to add your first ticker.
        </div>
      )}

      {quotes.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {quotes.map((q) => (
            <QuoteCard key={q.symbol} quote={q} remove={() => remove(q.symbol)} />
          ))}
        </div>
      )}

      <NewsList
        news={news.data}
        loading={news.loading}
        error={news.error}
        onRetry={news.reload}
        title="Market headlines"
        emptyText="No market headlines right now."
      />
    </div>
  );
}
