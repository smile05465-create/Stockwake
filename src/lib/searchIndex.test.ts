import { describe, expect, it } from "vitest";
import { matchSymbols, parseIndex } from "./searchIndex";
import type { IndexedSymbol } from "./searchIndex";

const INDEX: IndexedSymbol[] = [
  { symbol: "AAPL", name: "Apple Inc.", kind: "stock" },
  { symbol: "APLE", name: "Apple Hospitality REIT, Inc.", kind: "stock" },
  { symbol: "AAPY", name: "Kurv Yield Premium Strategy Apple ETF", kind: "etf" },
  { symbol: "MSFT", name: "Microsoft Corporation", kind: "stock" },
  { symbol: "SNPX", name: "Snapple Holdings Corp.", kind: "stock" },
  { symbol: "SPY", name: "State Street SPDR S&P 500 ETF Trust", kind: "etf" },
  { symbol: "ASPEN", name: "Aspen Aerogels, Inc.", kind: "stock" },
];

describe("parseIndex", () => {
  it("maps compact rows and the ETF flag", () => {
    expect(
      parseIndex({
        v: 1,
        updated: "2026-11-10",
        rows: [
          ["AAPL", "Apple Inc.", "s"],
          ["SPY", "SPDR S&P 500 ETF Trust", "e"],
        ],
      }),
    ).toEqual([
      { symbol: "AAPL", name: "Apple Inc.", kind: "stock" },
      { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", kind: "etf" },
    ]);
  });

  it("survives a malformed payload", () => {
    expect(parseIndex(undefined)).toEqual([]);
    expect(parseIndex({ v: 1, updated: "", rows: [["", "x", "s"]] as never })).toEqual([]);
  });

  it("falls back to the ticker when a name is missing", () => {
    const [hit] = parseIndex({ v: 1, updated: "", rows: [["ZZZ", "", "s"]] });
    expect(hit.name).toBe("ZZZ");
  });
});

describe("matchSymbols", () => {
  it("returns nothing for an empty or blank query", () => {
    expect(matchSymbols(INDEX, "")).toEqual([]);
    expect(matchSymbols(INDEX, "   ")).toEqual([]);
  });

  it("puts an exact ticker first", () => {
    const hits = matchSymbols(INDEX, "aapl");
    expect(hits[0]).toEqual({ symbol: "AAPL", name: "Apple Inc.", kind: "stock" });
  });

  it("ranks ticker prefixes above name matches", () => {
    const hits = matchSymbols(INDEX, "ap");
    expect(hits[0].symbol).toBe("APLE");
    expect(hits.map((h) => h.symbol)).toContain("AAPL");
  });

  it("matches a name on a word boundary, not mid-word", () => {
    const hits = matchSymbols(INDEX, "apple");
    const symbols = hits.map((h) => h.symbol);
    // "Apple …" names match; "Snapple" must not come up as a prefix hit.
    expect(symbols).toContain("AAPL");
    expect(symbols).toContain("APLE");
    expect(symbols.indexOf("SNPX")).toBeGreaterThan(symbols.indexOf("APLE"));
  });

  it("falls back to a name substring match", () => {
    expect(matchSymbols(INDEX, "aerogels").map((h) => h.symbol)).toEqual(["ASPEN"]);
  });

  it("is case-insensitive", () => {
    expect(matchSymbols(INDEX, "MiCrOsOfT")[0].symbol).toBe("MSFT");
  });

  it("respects the result limit", () => {
    const many: IndexedSymbol[] = Array.from({ length: 40 }, (_, i) => ({
      symbol: `ABC${i}`,
      name: `Abc Industries ${i}`,
      kind: "stock" as const,
    }));
    expect(matchSymbols(many, "abc")).toHaveLength(10);
    expect(matchSymbols(many, "abc", 3)).toHaveLength(3);
  });

  it("prefers the shorter ticker when scores tie", () => {
    const hits = matchSymbols(INDEX, "sp");
    expect(hits[0].symbol).toBe("SPY");
  });
});
