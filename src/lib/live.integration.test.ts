/**
 * Live integration test against the real market-data providers.
 *
 * Skipped by default so the regular suite stays hermetic; run with:
 *   STOCKWAKE_LIVE=1 bun run test
 *
 * Verifies search, quote, history, index batch quotes, movers, and news
 * all respond and parse through the app's own code path.
 */

import { describe, expect, it } from "vitest";
import {
  fetchCnbcQuotes,
  fetchHistory,
  fetchMarketNews,
  fetchMovers,
  fetchQuote,
  fetchSymbolNews,
  searchSymbols,
} from "./api";

const live = describe.skipIf(!process.env.STOCKWAKE_LIVE);

live("live market data providers", () => {
  it("search returns ranked hits (working search API)", async () => {
    const hits = await searchSymbols("nvidia");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].symbol.length).toBeGreaterThan(0);
    expect(hits[0].name.length).toBeGreaterThan(0);
  }, 20_000);

  it("quote returns a priced snapshot", async () => {
    const q = await fetchQuote("AAPL", "Apple Inc.");
    expect(q).not.toBeNull();
    expect(q!.price).toBeGreaterThan(0);
    expect(Number.isFinite(q!.changePct)).toBe(true);
    expect(q!.volume).toBeGreaterThan(0);
  }, 20_000);

  it("history returns ascending OHLCV bars for 6M", async () => {
    const bars = await fetchHistory("MSFT", "6M");
    expect(bars.length).toBeGreaterThan(20);
    for (let i = 1; i < bars.length; i++) {
      expect(bars[i].t >= bars[i - 1].t).toBe(true);
    }
    expect(bars[0].c).toBeGreaterThan(0);
  }, 25_000);

  it("index batch quotes parse with names and prices", async () => {
    const quotes = await fetchCnbcQuotes([".SPX", ".DJI", "IXIC", ".VIX"]);
    expect(quotes.length).toBeGreaterThanOrEqual(3);
    for (const q of quotes) {
      expect(q.price).toBeGreaterThan(0);
      expect(q.name.length).toBeGreaterThan(0);
    }
    expect(quotes.some((q) => q.kind === "index")).toBe(true);
  }, 20_000);

  it("movers return a populated gainers table", async () => {
    const movers = await fetchMovers("gainers");
    expect(movers.length).toBeGreaterThan(0);
    expect(movers[0].symbol.length).toBeGreaterThan(0);
    expect(movers[0].price).toBeGreaterThan(0);
    expect(movers[0].changePct).toBeGreaterThan(0);
  }, 20_000);

  it("market news returns headlines with URLs", async () => {
    const news = await fetchMarketNews();
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].title.length).toBeGreaterThan(0);
    expect(news[0].url).toMatch(/^https?:\/\//);
  }, 20_000);

  it("symbol news returns headlines with URLs", async () => {
    const news = await fetchSymbolNews("AAPL");
    expect(news.length).toBeGreaterThan(0);
    expect(news[0].url).toMatch(/^https?:\/\//);
  }, 20_000);
});
