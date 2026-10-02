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

/* ------------------------------------------------------------------ */
/* Search                                                              */
/* ------------------------------------------------------------------ */

interface SaSearchRow {
  id?: string;
  s?: string;
  t?: string;
  n?: string;
  st?: string;
}

/** Map a stockanalysis search row list to ranked SearchHits. */
export function parseSearch(payload: { data?: SaSearchRow[] } | null | undefined): SearchHit[] {
  const rows = payload?.data ?? [];
  const hits: SearchHit[] = rows
    .filter((r) => typeof r.s === "string" && r.s.length > 0)
    .map((r) => ({
      symbol: r.s as string,
      name: r.n ?? (r.s as string),
      kind: r.t === "e" || r.st === "e" ? "etf" : "stock",
    }));

  // Prefer plain US listings and exact-ticker matches at the top.
  return hits.sort((a, b) => {
    const aPlain = a.symbol.includes("/") ? 1 : 0;
    const bPlain = b.symbol.includes("/") ? 1 : 0;
    if (aPlain !== bPlain) return aPlain - bPlain;
    return 0;
  });
}

/** Search symbols by ticker or company name. */
export async function searchSymbols(query: string): Promise<SearchHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url = `${SA_BASE}/search?q=${encodeURIComponent(q)}&limit=10`;
  const data = await marketCache.wrap(url, 30_000, async () => {
    const json = (await fetchJson(url)) as { data?: SaSearchRow[] };
    return parseSearch(json);
  });
  return data;
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
export async function fetchQuote(
  symbol: string,
  name = symbol,
  kind: AssetKind = "stock",
): Promise<Quote | null> {
  const url = `${SA_BASE}/quotes/s/${encodeURIComponent(symbol)}`;
  return marketCache.wrap(url, 30_000, async () => {
    const json = (await fetchJson(url)) as { data?: SaQuoteData };
    return parseSaQuote(json, symbol, name, kind);
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
  const url = `${SA_BASE}/symbol/s/${encodeURIComponent(symbol)}/history?range=${param}&period=Daily`;
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
  const change = parseNum(r.change) ?? 0;
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
    changePct: parseNum(r.change_pct) ?? 0,
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

async function fetchRssJson(rssUrl: string, fallbackSource: string): Promise<NewsItem[]> {
  const url = `${RSS2JSON}?rss_url=${encodeURIComponent(rssUrl)}`;
  return marketCache.wrap(url, 300_000, async () => {
    const json = (await fetchJson(url)) as Rss2JsonPayload;
    return parseNews(json, fallbackSource);
  });
}

/** General market headlines. */
export function fetchMarketNews(): Promise<NewsItem[]> {
  return fetchRssJson(CNBC_TOP_NEWS_RSS, "CNBC");
}

/** Headlines related to one symbol (Google News query). */
export function fetchSymbolNews(symbol: string): Promise<NewsItem[]> {
  const rss = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${symbol} stock`,
  )}&hl=en-US&gl=US&ceid=US:en`;
  return fetchRssJson(rss, "Google News");
}
