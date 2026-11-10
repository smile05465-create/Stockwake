/**
 * Stockwake market data API.
 *
 * Provider map (all verified CORS-friendly, keyless):
 *  - stockanalysis.com  : symbol search, latest quote, daily OHLCV history
 *  - CNBC quote webservice : batch quotes (indices + watchlist), fundamentals
 *  - TradingView scanner : gainers / losers / most-active tables
 *  - rss2json + RSS feeds : market & per-symbol news
 *
 * Every provider has an exported pure `parse*` function so the mapping
 * logic is unit-testable without touching the network.
 */

import { marketCache } from "./cache";
import { searchSymbolsLocal } from "./searchIndex";
import type {
  AssetKind,
  Bar,
  ChartRange,
  KeyStats,
  Mover,
  NewsItem,
  Quote,
  SearchHit,
} from "./types";

const SA_BASE = "https://stockanalysis.com/api";
const CNBC_QUOTE =
  "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol";
const TV_SCAN = "https://scanner.tradingview.com/america/scan";
const RSS2JSON = "https://api.rss2json.com/v1/api.json";

const CNBC_TOP_NEWS_RSS = "https://www.cnbc.com/id/100003114/device/rss/rss.html";

/**
 * Optional server-side relay for price history.
 *
 * stockanalysis.com stopped sending CORS headers, so a static page cannot read
 * its history endpoint directly. Set VITE_HISTORY_PROXY to a small endpoint that
 * forwards `/api/...` to the provider and returns it with CORS, and this module
 * will route history through it. Contract:
 *
 *   GET <proxy>?p=<path after /api/>
 *   → the provider's JSON, unchanged, with Access-Control-Allow-Origin
 *
 * Without the variable, the direct call is attempted (and fails for browsers).
 */
const HISTORY_PROXY = (import.meta.env.VITE_HISTORY_PROXY ?? "").trim();

function historyUrl(path: string): string {
  if (!HISTORY_PROXY) return `${SA_BASE}${path}`;
  const sep = HISTORY_PROXY.includes("?") ? "&" : "?";
  return `${HISTORY_PROXY}${sep}p=${encodeURIComponent(path.replace(/^\//, ""))}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Browser-like User-Agent for non-browser runtimes (Node tests/SSR).
 * Browsers treat User-Agent as a forbidden header and send their own,
 * so this is a no-op in the app but required for CNBC's feed under Node.
 */
const NODE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** JSON GET with one retry on transient failures (e.g. Cloudflare 403). */
async function fetchJson(url: string, init?: RequestInit, attempts = 2): Promise<unknown> {
  let lastError: unknown = new Error(`Request failed: ${url}`);
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          "User-Agent": NODE_UA,
          ...init?.headers,
        },
        signal: init?.signal ?? AbortSignal.timeout?.(12_000),
      });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      // Cloudflare challenge / rate limit: back off and retry once.
      if (res.status === 403 || res.status === 429) {
        await sleep(1_200);
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** POST helper: same retry/back-off behaviour as fetchJson. */
/** Fetch a URL as text, with a timeout — RSS bridges hand back XML/HTML. */
async function fetchText(url: string, timeoutMs = 7_000): Promise<string> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout?.(timeoutMs),
    headers: { Accept: "text/xml, application/xml, text/plain, */*" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

async function fetchJsonWithBody(url: string, body: unknown, attempts = 2): Promise<unknown> {
  let lastError: unknown = new Error(`Request failed: ${url}`);
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "text/plain", Accept: "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout?.(12_000),
      });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status} for ${url}`);
      if (res.status === 403 || res.status === 429) {
        await sleep(1_200);
        continue;
      }
      break;
    } catch (err) {
      lastError = err;
      if (i < attempts - 1) await sleep(500);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

/**
 * Symbol search runs entirely against the bundled local index
 * (see `searchIndex.ts`). The previous stockanalysis.com endpoint is no
 * longer readable from a browser, and a local index also removes a network
 * round trip from every keystroke.
 */
export async function searchSymbols(query: string): Promise<SearchHit[]> {
  return searchSymbolsLocal(query);
}

/* ------------------------------------------------------------------ */
/* Performance profile (TradingView) — used when history is unavailable */
/* ------------------------------------------------------------------ */

export interface PerformanceProfile {
  w: number | null;
  m1: number | null;
  m3: number | null;
  m6: number | null;
  y1: number | null;
  y5: number | null;
  ytd: number | null;
  high52: number | null;
  low52: number | null;
}

const PERF_COLUMNS = [
  "close",
  "Perf.W",
  "Perf.1M",
  "Perf.3M",
  "Perf.6M",
  "Perf.Y",
  "Perf.5Y",
  "Perf.YTD",
  "price_52_week_high",
  "price_52_week_low",
];

/** Exchange name (CNBC) → TradingView venue prefix. */
export function venuePrefix(exchange: string | null | undefined): string | null {
  const e = (exchange ?? "").toUpperCase();
  if (!e) return null;
  if (e.includes("NASDAQ")) return "NASDAQ";
  if (e.includes("ARCA") || e.includes("AMERICAN") || e.includes("AMEX")) return "AMEX";
  if (e.includes("NYSE")) return "NYSE";
  return null;
}

/** Map one scanner row to a profile (pure, testable). */
export function parsePerformance(
  row: { d?: unknown[] } | null | undefined,
): PerformanceProfile | null {
  const d = row?.d;
  if (!Array.isArray(d) || d.length < 10) return null;
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    m1: num(d[2]),
    m3: num(d[3]),
    m6: num(d[4]),
    y1: num(d[5]),
    y5: num(d[6]),
    ytd: num(d[7]),
    high52: num(d[8]),
    low52: num(d[9]),
    w: num(d[1]),
  };
}

/**
 * Range performance for a symbol from the Triton-sourced scanner the movers
 * table already uses. Chart history needs a CORS relay; this does not, so the
 * symbol page can still show how the stock has actually done.
 */
export async function fetchPerformance(
  symbol: string,
  exchange?: string | null,
): Promise<PerformanceProfile | null> {
  const pref = venuePrefix(exchange);
  const candidates = pref ? [pref] : ["NASDAQ", "NYSE", "AMEX"];

  for (const venue of candidates) {
    const ticker = `${venue}:${symbol.toUpperCase()}`;
    try {
      const json = (await marketCache.wrap(`perf:${ticker}`, 300_000, async () => {
        return (await fetchJsonWithBody(TV_SCAN, {
          symbols: { tickers: [ticker], query: { types: [] } },
          columns: PERF_COLUMNS,
        })) as { data?: { d?: unknown[] }[] };
      })) as { data?: { d?: unknown[] }[] };
      const row = json?.data?.[0];
      if (row?.d?.length) return parsePerformance(row);
    } catch {
      // try the next venue
    }
  }
  return null;
}

/**
 * Real moves for a batch of symbols, from the TradingView scanner the movers
 * table already uses. Needed because CNBC withholds `change` after hours
 * ("UNCH") and the browser cannot read stockanalysis at all — without this the
 * watchlist would have to say "change unavailable" for every row.
 */
export interface ScannerChange {
  symbol: string;
  change: number | null;
  changePct: number | null;
}

// TradingView names these oddly: "change" is the percentage, "change_abs" is
// the absolute move.
const CHANGE_COLUMNS = ["change", "change_abs", "close", "description"];

export function parseScannerChanges(
  payload: { data?: { s?: string; d?: unknown[] }[] } | null | undefined,
): ScannerChange[] {
  const rows = payload?.data ?? [];
  return rows.flatMap((row) => {
    const full = String(row.s ?? "");
    const symbol = full.includes(":") ? full.split(":")[1] : full;
    const d = row.d ?? [];
    const num = (v: unknown): number | null => {
      const n = typeof v === "number" ? v : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    if (!symbol) return [];
    return [{ symbol, changePct: num(d[0]), change: num(d[1]) }];
  });
}

/**
 * Fetch moves for many symbols in one request. `exchanges` maps a symbol to the
 * venue we already know; unknown venues are tried on all three prefixes.
 */
export async function fetchScannerChanges(
  entries: { symbol: string; exchange?: string | null }[],
): Promise<Map<string, ScannerChange>> {
  const tickers = new Set<string>();
  for (const e of entries) {
    const pref = venuePrefix(e.exchange);
    if (pref) tickers.add(`${pref}:${e.symbol.toUpperCase()}`);
    else for (const p of ["NASDAQ", "NYSE", "AMEX"]) tickers.add(`${p}:${e.symbol.toUpperCase()}`);
  }
  if (tickers.size === 0) return new Map();

  const list = [...tickers];
  const out = new Map<string, ScannerChange>();
  for (let i = 0; i < list.length; i += 60) {
    const chunk = list.slice(i, i + 60);
    try {
      const json = (await marketCache.wrap(`changes:${chunk.join(",")}`, 60_000, async () =>
        fetchJsonWithBody(TV_SCAN, {
          symbols: { tickers: chunk, query: { types: [] } },
          columns: CHANGE_COLUMNS,
        }),
      )) as { data?: { s?: string; d?: unknown[] }[] };
      for (const row of parseScannerChanges(json)) {
        // First venue to answer for a symbol wins; later duplicates are ignored.
        if (!out.has(row.symbol)) out.set(row.symbol, row);
      }
    } catch {
      // A failed chunk leaves those symbols unknown rather than wrong.
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Latest quote (stockanalysis)                                        */
/* ------------------------------------------------------------------ */

interface SaQuoteData {
  p?: number;
  c?: number;
  cp?: number;
  cl?: number;
  o?: number;
  h?: number;
  l?: number;
  v?: number;
  td?: string;
  ex?: string;
  h52?: number;
  l52?: number;
  ms?: string;
  es?: string;
  e?: boolean;
  ep?: number;
  ecp?: number;
  symbol?: string;
}

/** Map a stockanalysis quote payload to our Quote shape. */
export function parseSaQuote(
  payload: { data?: SaQuoteData } | null | undefined,
  symbol: string,
  fallbackName: string,
  kind: AssetKind = "stock",
): Quote | null {
  const d = payload?.data;
  if (!d || typeof d.p !== "number") return null;

  const es = typeof d.es === "string" ? d.es : "";
  const session: Quote["session"] = es.toLowerCase().includes("pre")
    ? "pre"
    : es.toLowerCase().includes("post")
      ? "post"
      : d.ms === "open"
        ? "open"
        : "closed";

  return {
    symbol: d.symbol ?? symbol,
    name: fallbackName,
    kind,
    price: d.p,
    change: d.c ?? d.p - (d.cl ?? d.p),
    changePct: d.cp ?? 0,
    previousClose: d.cl ?? d.p,
    open: d.o ?? null,
    high: d.h ?? null,
    low: d.l ?? null,
    // Volume is a share count — the feed returns a float, keep it integral.
    volume: d.v != null ? Math.round(d.v) : 0,
    date: d.td ?? "",
    currency: "USD",
    exchange: d.ex ?? "",
    marketCap: null,
    high52w: d.h52 ?? null,
    low52w: d.l52 ?? null,
    extended:
      d.e && typeof d.ep === "number"
        ? { price: d.ep, changePct: d.ecp ?? 0, label: es || "Extended" }
        : null,
    session,
  };
}

/** Latest quote for one stock/ETF. */
/* ------------------------------------------------------------------ */
/* Offline quotes — a phone in a lift should still show yesterday       */
/* ------------------------------------------------------------------ */

const QUOTE_CACHE_PREFIX = "stockwake.quote.";
const QUOTE_CACHE_TTL = 12 * 60 * 60 * 1000;

/** Remember the last good quote for a symbol (12h), so the app can show it offline. */
export function rememberQuote(quote: Quote): void {
  try {
    window.localStorage.setItem(
      QUOTE_CACHE_PREFIX + quote.symbol.toUpperCase(),
      JSON.stringify({ at: Date.now(), quote }),
    );
  } catch {
    // A full or blocked store must never break a successful fetch.
  }
}

/** Last known quote for a symbol, marked stale. Null when there is none. */
export function cachedQuote(symbol: string): Quote | null {
  try {
    const raw = window.localStorage.getItem(QUOTE_CACHE_PREFIX + symbol.toUpperCase());
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; quote: Quote };
    if (!parsed?.quote || Date.now() - parsed.at > QUOTE_CACHE_TTL) return null;
    return { ...parsed.quote, stale: true, cachedAt: parsed.at };
  } catch {
    return null;
  }
}

export async function fetchQuote(
  symbol: string,
  name = symbol,
  kind: AssetKind = "stock",
): Promise<Quote | null> {
  const url = `${SA_BASE}/quotes/s/${encodeURIComponent(symbol)}`;
  return marketCache.wrap(url, 30_000, async () => {
    const json = (await fetchJson(url)) as { data?: SaQuoteData };
    const quote = parseSaQuote(json, symbol, name, kind);
    if (quote) rememberQuote(quote);
    return quote;
  });
}

/* ------------------------------------------------------------------ */
/* Price history (stockanalysis)                                       */
/* ------------------------------------------------------------------ */

interface SaBar {
  t?: string;
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
}

/**
 * Map history payload to ascending Bar[].
 * stockanalysis returns newest-first; charts want oldest-first.
 */
export function parseHistory(payload: { data?: SaBar[] } | null | undefined): Bar[] {
  const rows = payload?.data ?? [];
  const bars: Bar[] = [];
  for (const r of rows) {
    if (!r.t || typeof r.c !== "number") continue;
    bars.push({
      t: r.t,
      o: r.o ?? r.c,
      h: r.h ?? r.c,
      l: r.l ?? r.c,
      c: r.c,
      v: r.v ?? 0,
    });
  }
  bars.sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : 0));
  return bars;
}

/** Trim daily bars to roughly the trailing `months` calendar months. */
export function trimToMonths(bars: Bar[], months: number): Bar[] {
  if (bars.length === 0) return bars;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const trimmed = bars.filter((b) => b.t >= cutoffIso);
  return trimmed.length >= 5 ? trimmed : bars.slice(-22);
}

/** Trim daily bars to roughly the trailing `days` calendar days (~1 trading week). */
export function trimToDays(bars: Bar[], days: number): Bar[] {
  if (bars.length === 0) return bars;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  const trimmed = bars.filter((b) => b.t >= cutoffIso);
  return trimmed.length >= 2 ? trimmed : bars.slice(-5);
}

/**
 * 1D view: the previous session plus the current one.
 *
 * The providers only serve daily bars, so 1D is honestly built from real
 * data: the last two sessions, with the live quote merged into today's bar
 * (open/high/low/close/volume from the quote) when its date is newer than —
 * or the same as — the last daily bar. No synthetic intraday points.
 */
export function sessionBars(bars: Bar[], quote: Quote | null): Bar[] {
  if (bars.length === 0) return bars;
  const last = bars[bars.length - 1];
  if (!quote || !quote.date || quote.price <= 0) return bars.slice(-2);

  if (quote.date > last.t) {
    // Quote is a newer session than the last daily bar — append today.
    const live: Bar = {
      t: quote.date,
      o: quote.open ?? quote.price,
      h: Math.max(quote.price, quote.high ?? -Infinity, quote.open ?? -Infinity),
      l: Math.min(quote.price, quote.low ?? Infinity, quote.open ?? Infinity),
      c: quote.price,
      v: quote.volume,
    };
    return [...bars, live].slice(-2);
  }
  if (quote.date === last.t) {
    // Same session — refresh the bar with the live quote without ever
    // shrinking the daily high/low when the quote omits them.
    const live: Bar = {
      ...last,
      o: quote.open ?? last.o,
      h: Math.max(last.h, quote.price, quote.high ?? -Infinity),
      l: Math.min(last.l, quote.price, quote.low ?? Infinity),
      c: quote.price,
      v: quote.volume || last.v,
    };
    return [...bars.slice(0, -1), live];
  }
  // Quote is older than the last bar (stale) — keep history as-is.
  return bars.slice(-2);
}

const SA_RANGE_PARAM: Record<ChartRange, string> = {
  // SA only honors ranges ≥ 3M and serves daily bars only; fetch 3M once and
  // trim client-side (1D/1W/1M therefore share one cached payload).
  "1D": "3M",
  "1W": "3M",
  "1M": "3M",
  "3M": "3M",
  "6M": "6M",
  "1Y": "1Y",
  "5Y": "5Y",
};

/** OHLCV history for a symbol over a display range. */
export async function fetchHistory(symbol: string, range: ChartRange): Promise<Bar[]> {
  const param = SA_RANGE_PARAM[range];
  const url = historyUrl(
    `/symbol/s/${encodeURIComponent(symbol)}/history?range=${param}&period=Daily`,
  );
  const bars = await marketCache.wrap(url, 300_000, async () => {
    const json = (await fetchJson(url)) as { data?: SaBar[] };
    return parseHistory(json);
  });
  if (range === "1D") return bars.slice(-2);
  if (range === "1W") return trimToDays(bars, 7);
  if (range === "1M") return trimToMonths(bars, 1);
  return bars;
}

/* ------------------------------------------------------------------ */
/* CNBC batch quotes: indices, watchlist, fundamentals                 */
/* ------------------------------------------------------------------ */

interface CnbcRow {
  symbol?: string;
  name?: string;
  type?: string;
  last?: string;
  change?: string;
  change_pct?: string;
  previous_day_closing?: string;
  open?: string;
  high?: string;
  low?: string;
  volume?: string;
  exchange?: string;
  currencyCode?: string;
  curmktstatus?: string;
  yrhiprice?: string;
  yrloprice?: string;
  mktcapView?: string;
  pe?: string;
  eps?: string;
  dividendyield?: string;
  beta?: string;
  revenuettm?: string;
  ROETTM?: string;
  realTime?: string;
  ExtendedMktQuote?: {
    last?: string;
    change_pct?: string;
    last_timedate?: string;
  };
  EventData?: {
    next_earnings_date?: string;
  };
}

/** Parse "1,234.56" / "0.81%" / "4.821T" style strings. */
export function parseNum(raw: string | undefined | null): number | null {
  if (raw == null) return null;
  const cleaned = raw.replace(/,/g, "").replace(/[%+\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "" || cleaned === "-" || cleaned == null) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse compact suffixed numbers like "4.821T" / "466.823B" / "221.7K". */
export function parseCompact(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = raw.match(/^(-?[\d.,]+)\s*([TBMK])?$/i);
  if (!m) return parseNum(raw);
  const base = parseNum(m[1]);
  if (base == null) return null;
  const suffix = (m[2] ?? "").toUpperCase();
  const mult = suffix === "T" ? 1e12 : suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return base * mult;
}

function mapSession(status: string | undefined): Quote["session"] {
  switch (status) {
    case "REG_MKT":
      return "open";
    case "PRE_MKT":
      return "pre";
    case "POST_MKT":
      return "post";
    default:
      return "closed";
  }
}

function cnbcRowToQuote(r: CnbcRow): (Quote & { stats: KeyStats; nextEarnings: string | null }) | null {
  const price = parseNum(r.last);
  if (price == null || !r.symbol) return null;

  // CNBC sends the literal string "UNCH" for change fields after hours. That is
  // not the same as "unchanged": AAPL was up 2.43% and still arrived as "UNCH".
  // Prefer arithmetic from the previous close; if the feed withholds both, say
  // so rather than printing a confident 0.00%.
  const rawChange = parseNum(r.change);
  const prevClose = parseNum(r.previous_day_closing);
  let change = rawChange;
  let changePct = parseNum(r.change_pct);
  if (prevClose != null && prevClose > 0) {
    const computed = price - prevClose;
    if (change === null && Math.abs(computed) > 0.005) {
      change = computed;
      changePct = (computed / prevClose) * 100;
    } else if (change !== null && Math.abs(computed) > 0.005 && Math.abs(computed - change) > 0.01) {
      change = computed;
      changePct = (computed / prevClose) * 100;
    }
  }
  const unknownChange = rawChange === null && (prevClose == null || Math.abs(prevClose - price) < 0.005);
  change = change ?? 0;
  changePct = unknownChange ? Number.NaN : (changePct ?? 0);

  const kind: AssetKind = r.type === "INDEX" ? "index" : "stock";
  const ext = r.ExtendedMktQuote;
  const extPrice = parseNum(ext?.last);

  const stats: KeyStats = {
    pe: parseNum(r.pe),
    eps: parseNum(r.eps),
    dividendYield: parseNum(r.dividendyield),
    beta: parseNum(r.beta),
    revenueTtm: parseCompact(r.revenuettm),
    roe: parseNum(r.ROETTM),
    nextEarnings: r.EventData?.next_earnings_date ?? null,
  };

  return {
    symbol: r.symbol,
    name: r.name ?? r.symbol,
    kind,
    price,
    change,
    changePct,
    unknownChange,
    // Derive previous close: CNBC's previous_day_closing is unreliable after hours.
    previousClose: price - change,
    open: parseNum(r.open),
    high: parseNum(r.high),
    low: parseNum(r.low),
    volume: parseNum(r.volume) ?? 0,
    date: "",
    currency: r.currencyCode ?? "USD",
    exchange: r.exchange ?? "",
    marketCap: parseCompact(r.mktcapView),
    high52w: parseNum(r.yrhiprice),
    low52w: parseNum(r.yrloprice),
    extended:
      extPrice != null
        ? {
            price: extPrice,
            changePct: parseNum(ext?.change_pct) ?? 0,
            label: ext?.last_timedate ?? "Extended",
          }
        : null,
    session: mapSession(r.curmktstatus),
    stats,
    nextEarnings: r.EventData?.next_earnings_date ?? null,
  };
}

export type CnbcQuote = NonNullable<ReturnType<typeof cnbcRowToQuote>>;

/** Parse CNBC batch quote payload (keeps fundamentals alongside the quote). */
export function parseCnbcQuotes(
  payload: { FormattedQuoteResult?: { FormattedQuote?: CnbcRow[] } } | null | undefined,
): CnbcQuote[] {
  const rows = payload?.FormattedQuoteResult?.FormattedQuote ?? [];
  return rows.map(cnbcRowToQuote).filter((q): q is CnbcQuote => q !== null);
}

/** Batch-fetch quotes (indices, watchlist…) by CNBC symbol. */
export async function fetchCnbcQuotes(symbols: string[]): Promise<CnbcQuote[]> {
  if (symbols.length === 0) return [];
  const encoded = symbols.map(encodeURIComponent).join("%7C");
  const url = `${CNBC_QUOTE}?symbols=${encoded}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  return marketCache.wrap(url, 30_000, async () => {
    const json = (await fetchJson(url)) as {
      FormattedQuoteResult?: { FormattedQuote?: CnbcRow[] };
    };
    return parseCnbcQuotes(json);
  });
}

/** Extract KeyStats from a CNBC quote (symbol page stats card). */
export function keyStatsFrom(q: CnbcQuote): KeyStats {
  return {
    pe: q.stats.pe,
    eps: q.stats.eps,
    dividendYield: q.stats.dividendYield,
    beta: q.stats.beta,
    revenueTtm: q.stats.revenueTtm,
    roe: q.stats.roe,
    nextEarnings: q.nextEarnings,
  };
}

/* ------------------------------------------------------------------ */
/* Movers (TradingView scanner)                                        */
/* ------------------------------------------------------------------ */

export type MoversTab = "gainers" | "losers" | "active";

interface TvScanPayload {
  data?: Array<{ s?: string; d?: unknown[] }>;
}

/**
 * Parse TradingView scanner payload.
 * Columns order: name, close, change, change_abs, volume, market_cap_basic, description, exchange.
 */
export function parseMovers(payload: TvScanPayload | null | undefined): Mover[] {
  const rows = payload?.data ?? [];
  const out: Mover[] = [];
  for (const row of rows) {
    const d = row.d ?? [];
    const [name, close, change, changeAbs, volume, mcap, description, exchange] = d as [
      string,
      number,
      number,
      number,
      number,
      number | null,
      string,
      string,
    ];
    const symbol = row.s?.includes(":") ? row.s.split(":").pop() : (row.s ?? name);
    if (!symbol || typeof close !== "number") continue;
    out.push({
      symbol,
      name: description || symbol,
      price: close,
      changePct: typeof change === "number" ? change : 0,
      change: typeof changeAbs === "number" ? changeAbs : 0,
      volume: typeof volume === "number" ? volume : 0,
      marketCap: typeof mcap === "number" ? mcap : null,
      exchange: exchange ?? "",
    });
  }
  return out;
}

function moversBody(tab: MoversTab): string {
  const baseFilters = [
    { left: "type", operation: "equal", right: "stock" },
    { left: "close", operation: "greater", right: 1 },
    { left: "volume", operation: "greater", right: 200_000 },
    { left: "market_cap_basic", operation: "greater", right: 200_000_000 },
    {
      left: "exchange",
      operation: "in_range",
      right: ["NASDAQ", "NYSE", "NYSEAMERICAN"],
    },
  ];
  const sort =
    tab === "active"
      ? { sortBy: "volume", sortOrder: "desc" }
      : { sortBy: "change", sortOrder: tab === "gainers" ? "desc" : "asc" };

  return JSON.stringify({
    filter: baseFilters,
    options: { lang: "en" },
    markets: ["america"],
    symbols: { query: { types: [] }, tickers: [] },
    columns: [
      "name",
      "close",
      "change",
      "change_abs",
      "volume",
      "market_cap_basic",
      "description",
      "exchange",
    ],
    sort,
    range: [0, 8],
  });
}

/**
 * Fetch top movers. Uses `text/plain` on purpose: TradingView's CORS
 * preflight only allows Referer/Accept headers, and text/plain is a
 * safelisted content type, so browsers send it as a simple request.
 */
export async function fetchMovers(tab: MoversTab): Promise<Mover[]> {
  const cacheKey = `tv-movers-${tab}`;
  return marketCache.wrap(cacheKey, 120_000, async () => {
    const json = (await fetchJson(
      TV_SCAN,
      {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: moversBody(tab),
      },
      2,
    )) as TvScanPayload;
    return parseMovers(json);
  });
}

/* ------------------------------------------------------------------ */
/* News (rss2json)                                                     */
/* ------------------------------------------------------------------ */

interface Rss2JsonPayload {
  status?: string;
  feed?: { title?: string };
  items?: Array<{
    title?: string;
    link?: string;
    pubDate?: string;
    author?: string;
    source?: string;
  }>;
}

/** Parse rss2json payload into NewsItems. */
export function parseNews(
  payload: Rss2JsonPayload | null | undefined,
  fallbackSource: string,
): NewsItem[] {
  if (!payload || payload.status !== "ok") return [];
  const items = payload.items ?? [];
  return items
    .filter((i) => typeof i.title === "string" && typeof i.link === "string")
    .map((i) => ({
      title: i.title as string,
      url: i.link as string,
      publishedAt: i.pubDate ?? "",
      source: i.source || i.author || payload.feed?.title || fallbackSource,
    }));
}

const NEWS_CACHE_PREFIX = "stockwake.news.";

function readNewsCache(rssUrl: string): NewsItem[] | null {
  try {
    const raw = window.localStorage.getItem(NEWS_CACHE_PREFIX + rssUrl);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; items: NewsItem[] };
    // Keep a day of history: a headline from this morning beats an error card.
    if (Date.now() - parsed.at > 86_400_000) return null;
    return Array.isArray(parsed.items) && parsed.items.length > 0 ? parsed.items : null;
  } catch {
    return null;
  }
}

function writeNewsCache(rssUrl: string, items: NewsItem[]): void {
  try {
    window.localStorage.setItem(
      NEWS_CACHE_PREFIX + rssUrl,
      JSON.stringify({ at: Date.now(), items }),
    );
  } catch {
    // Cache is a convenience; failing to store it must never break the page.
  }
}

const XML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Undo the escaping a feed applies to its own text. */
function decodeXml(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name: string) => XML_ENTITIES[name] ?? m)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The text of the first `<tag>` inside a fragment, or an empty string. */
function xmlField(fragment: string, tag: string): string {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(fragment);
  return match ? decodeXml(match[1]) : "";
}

/**
 * Read an RSS document into news items. The bridges mostly hand back the
 * feed's own XML, so this walks `<item>` elements itself — no DOMParser, which
 * keeps it identical in the browser and under test. Exported because this is
 * the part that breaks silently when a feed changes its markup.
 */
export function parseRssXml(xml: string, fallbackSource: string): NewsItem[] {
  if (!xml) return [];
  const blocks = xml.match(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi) ?? [];
  const out: NewsItem[] = [];
  for (const block of blocks) {
    const title = xmlField(block, "title");
    const link = xmlField(block, "link") || xmlField(block, "guid");
    if (!title || !link) continue;
    out.push({
      title,
      url: link,
      publishedAt: xmlField(block, "pubDate") || xmlField(block, "dc:date"),
      source: xmlField(block, "source") || fallbackSource,
    });
  }
  return out;
}

/**
 * Every bridge is somebody's free service, and each one fails in its own way:
 * rss2json caps a shared IP by the day, allorigins and codetabs go down for
 * hours, and none of them promise anything. They are tried in turn — the one
 * that worked last time first, so a healthy setup pays for exactly one request.
 */
interface RssBridge {
  id: string;
  build: (rssUrl: string) => string;
  parse: (body: string, fallbackSource: string) => NewsItem[];
}

const RSS_BRIDGES: RssBridge[] = [
  {
    id: "rss2json",
    build: (rss) => `${RSS2JSON}?rss_url=${encodeURIComponent(rss)}`,
    parse: (body, source) => {
      try {
        return parseNews(JSON.parse(body) as Rss2JsonPayload, source);
      } catch {
        return [];
      }
    },
  },
  {
    id: "allorigins",
    build: (rss) => `https://api.allorigins.win/raw?url=${encodeURIComponent(rss)}`,
    parse: parseRssXml,
  },
  {
    id: "codetabs",
    build: (rss) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(rss)}`,
    parse: parseRssXml,
  },
];

/** Fresh headlines per feed, so a tab switch does not re-ask every bridge. */
const newsMemo = new Map<string, { at: number; items: NewsItem[] }>();

const BRIDGE_PREF_KEY = "stockwake.news.bridge";

/** Fresh headlines per feed, so a tab switch does not re-ask every bridge. */

function preferredBridgeId(): string | null {
  try {
    return window.localStorage.getItem(BRIDGE_PREF_KEY);
  } catch {
    return null;
  }
}

function rememberBridge(id: string): void {
  try {
    window.localStorage.setItem(BRIDGE_PREF_KEY, id);
  } catch {
    // A remembered preference is a nicety, never a requirement.
  }
}

/**
 * Headlines for one feed URL, from whichever bridge answers first. The last
 * good set is cached for a day, so a day of bridge failures shows this
 * morning's news (every item is time-stamped) rather than an error card.
 */
async function fetchHeadlines(rssUrl: string, fallbackSource: string): Promise<NewsItem[]> {
  const memoKey = `${rssUrl}|${fallbackSource}`;
  const memo = newsMemo.get(memoKey);
  if (memo && Date.now() - memo.at < 600_000) return memo.items;

  const preferred = preferredBridgeId();
  const order = [...RSS_BRIDGES].sort((a, b) => {
    if (a.id === preferred) return -1;
    if (b.id === preferred) return 1;
    return 0;
  });

  for (const bridge of order) {
    try {
      const body = await fetchText(bridge.build(rssUrl));
      const items = bridge.parse(body, fallbackSource).slice(0, 30);
      if (items.length > 0) {
        newsMemo.set(memoKey, { at: Date.now(), items });
        writeNewsCache(rssUrl, items);
        rememberBridge(bridge.id);
        return items;
      }
    } catch {
      // Try the next bridge; one bridge being down says nothing about the rest.
    }
  }

  const cached = readNewsCache(rssUrl);
  if (cached) return cached;
  throw new Error("no news bridge answered");
}


/** General market headlines. */
export function fetchMarketNews(): Promise<NewsItem[]> {
  return fetchHeadlines(CNBC_TOP_NEWS_RSS, "CNBC");
}

/** Headlines related to one symbol (Google News query). */
export function fetchSymbolNews(symbol: string): Promise<NewsItem[]> {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${symbol} stock`,
  )}&hl=en-US&gl=US&ceid=US:en`;
  return fetchHeadlines(rss, "Google News");
}
