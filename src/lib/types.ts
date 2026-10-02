/** Shared domain types for Stockwake market data. */

export type AssetKind = "stock" | "etf" | "index";

/** A lightweight search hit from the symbol search provider. */
export interface SearchHit {
  /** Canonical ticker, e.g. "AAPL". */
  symbol: string;
  name: string;
  kind: AssetKind;
}

/** Latest quote snapshot for a single symbol. */
export interface Quote {
  symbol: string;
  name: string;
  kind: AssetKind;
  /** Last trade / close price. */
  price: number;
  /** Absolute change vs previous close. */
  change: number;
  /** Percent change vs previous close (e.g. -0.81). */
  changePct: number;
  previousClose: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number;
  /** Previous close date or last trade date, ISO (YYYY-MM-DD). */
  date: string;
  currency: string;
  exchange: string;
  marketCap: number | null;
  /** 52-week high/low when the provider supplies them. */
  high52w: number | null;
  low52w: number | null;
  /** Pre/post market quote when available. */
  extended: {
    price: number;
    changePct: number;
    label: string;
  } | null;
  /** "open" | "pre" | "post" | "closed" when known. */
  session: "open" | "pre" | "post" | "closed" | null;
}

/** One OHLCV bar. */
export interface Bar {
  /** ISO date (YYYY-MM-DD) for daily bars. */
  t: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Chart display ranges. `6M` stays in the type for API compatibility even
 * though the page shows 1D/1W/1M/3M/1Y/5Y. 1D and 1W are derived client-side
 * from daily bars (the providers only serve daily OHLCV).
 */
export type ChartRange = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";

/** A row in the movers table. */
export interface Mover {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  change: number;
  volume: number;
  marketCap: number | null;
  exchange: string;
}

export interface NewsItem {
  title: string;
  url: string;
  publishedAt: string;
  source: string;
}

/** Fundamental statistics shown on the symbol page. */
export interface KeyStats {
  pe: number | null;
  eps: number | null;
  dividendYield: number | null;
  beta: number | null;
  revenueTtm: number | null;
  roe: number | null;
  nextEarnings: string | null;
}
