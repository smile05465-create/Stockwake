import { describe, expect, it } from "vitest";
import {
  parseCnbcQuotes,
  parseCompact,
  parseHistory,
  parseMovers,
  parseNews,
  parseNum,
  parseSaQuote,
  parseSearch,
  sessionBars,
  trimToDays,
  trimToMonths,
} from "./api";
import type { Bar, Quote } from "./types";

describe("parseSearch", () => {
  it("maps stockanalysis search rows", () => {
    const hits = parseSearch({
      data: [
        { id: "AAPL", s: "AAPL", t: "s", n: "Apple Inc." },
        { id: "AAPY", s: "AAPY", t: "e", n: "Kurv Yield Premium Strategy Apple (AAPL) ETF" },
      ],
    });
    expect(hits).toEqual([
      { symbol: "AAPL", name: "Apple Inc.", kind: "stock" },
      {
        symbol: "AAPY",
        name: "Kurv Yield Premium Strategy Apple (AAPL) ETF",
        kind: "etf",
      },
    ]);
  });

  it("prefers plain listings over exchange-prefixed ones", () => {
    const hits = parseSearch({
      data: [
        { s: "ase/MSFT", t: "sy", n: "Masafat for Specialised Transport Company", st: "s" },
        { s: "MSFT", t: "s", n: "Microsoft Corporation" },
      ],
    });
    expect(hits[0].symbol).toBe("MSFT");
  });

  it("uses ticker as name fallback", () => {
    const hits = parseSearch({ data: [{ s: "ZZZZ", t: "s" }] });
    expect(hits[0].name).toBe("ZZZZ");
  });

  it("handles empty payloads", () => {
    expect(parseSearch(null)).toEqual([]);
    expect(parseSearch({})).toEqual([]);
    expect(parseSearch({ data: [{ t: "s" }] })).toEqual([]);
  });
});

describe("parseSaQuote", () => {
  // Shape verified against https://stockanalysis.com/api/quotes/s/AAPL
  const payload = {
    status: 200,
    data: {
      p: 330.32,
      pd: 330.32,
      c: -2.7,
      cp: -0.81,
      cl: 333.02,
      cdr: -1,
      o: 330,
      h: 332.48,
      l: 325.81,
      v: 36306346.557309,
      td: "2026-10-01",
      h52: 345.34,
      l52: 243.42,
      ex: "NASDAQ",
      ms: "closed",
      fms: "pre",
      e: true,
      ep: 331.3,
      ecp: 0.3,
      es: "Pre-market",
      symbol: "AAPL",
    },
  };

  it("maps a full quote payload", () => {
    const q = parseSaQuote(payload, "AAPL", "Apple Inc.");
    expect(q).not.toBeNull();
    expect(q!.symbol).toBe("AAPL");
    expect(q!.price).toBe(330.32);
    expect(q!.change).toBe(-2.7);
    expect(q!.changePct).toBe(-0.81);
    expect(q!.previousClose).toBe(333.02);
    expect(q!.high52w).toBe(345.34);
    expect(q!.low52w).toBe(243.42);
    expect(q!.exchange).toBe("NASDAQ");
    expect(q!.volume).toBeCloseTo(36306347);
  });

  it("derives pre-market extended quote and session", () => {
    const q = parseSaQuote(payload, "AAPL", "Apple Inc.")!;
    expect(q.extended).toEqual({ price: 331.3, changePct: 0.3, label: "Pre-market" });
    expect(q.session).toBe("pre");
  });

  it("marks a plain closed quote as closed", () => {
    const q = parseSaQuote(
      { data: { p: 10, c: 0.5, cp: 5, cl: 9.5, ms: "closed" } },
      "X",
      "X",
    )!;
    expect(q.session).toBe("closed");
    expect(q.extended).toBeNull();
  });

  it("returns null for missing/invalid payloads", () => {
    expect(parseSaQuote(null, "A", "A")).toBeNull();
    expect(parseSaQuote({}, "A", "A")).toBeNull();
    expect(parseSaQuote({ data: {} }, "A", "A")).toBeNull();
  });

  it("applies fallback name and symbol when absent", () => {
    const q = parseSaQuote({ data: { p: 5, cl: 4 } }, "FALL", "Fallback Co")!;
    expect(q.symbol).toBe("FALL");
    expect(q.name).toBe("Fallback Co");
  });
});

describe("parseHistory", () => {
  it("reorders newest-first payloads into ascending bars", () => {
    const bars = parseHistory({
      data: [
        { t: "2026-10-01", o: 330, h: 332, l: 325, c: 330.32, v: 100 },
        { t: "2026-09-30", o: 330.8, h: 339, l: 330, c: 333.02, v: 200 },
        { t: "2026-09-29", o: 336, h: 337, l: 328, c: 329.4, v: 300 },
      ],
    });
    expect(bars.map((b) => b.t)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(bars[2].c).toBe(330.32);
  });

  it("fills missing OHLC from close", () => {
    const bars = parseHistory({ data: [{ t: "2026-10-01", c: 42, v: 5 }] });
    expect(bars[0]).toEqual({ t: "2026-10-01", o: 42, h: 42, l: 42, c: 42, v: 5 });
  });

  it("drops rows without a date or close", () => {
    const bars = parseHistory({ data: [{ o: 1 }, { c: 2 }, { t: "2026-01-01", c: 3 }] });
    expect(bars).toHaveLength(1);
  });

  it("handles empty payloads", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory({})).toEqual([]);
  });
});

describe("trimToMonths", () => {
  const makeBars = (days: number): Bar[] => {
    const out: Bar[] = [];
    const start = new Date();
    start.setDate(start.getDate() - days);
    for (let i = 0; i <= days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      out.push({ t: d.toISOString().slice(0, 10), o: 1, h: 1, l: 1, c: 1, v: 1 });
    }
    return out;
  };

  it("keeps only the trailing month for a year of data", () => {
    const trimmed = trimToMonths(makeBars(365), 1);
    expect(trimmed.length).toBeLessThan(40);
    expect(trimmed.length).toBeGreaterThan(10);
  });

  it("keeps 3-month windows intact", () => {
    const trimmed = trimToMonths(makeBars(65), 3);
    expect(trimmed.length).toBeGreaterThanOrEqual(55);
  });

  it("falls back to last ~month of bars when trim is too aggressive", () => {
    const bars = makeBars(400);
    const trimmed = trimToMonths(bars, 1);
    // Never returns a near-empty chart.
    expect(trimmed.length).toBeGreaterThanOrEqual(5);
  });

  it("handles empty input", () => {
    expect(trimToMonths([], 1)).toEqual([]);
  });
});

describe("trimToDays", () => {
  const isoDaysAgo = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d.toISOString().slice(0, 10);
  };
  const mk = (t: string): Bar => ({ t, o: 1, h: 1, l: 1, c: 1, v: 1 });

  it("keeps the trailing calendar week of bars", () => {
    const bars = Array.from({ length: 60 }, (_, i) => mk(isoDaysAgo(59 - i)));
    const trimmed = trimToDays(bars, 7);
    expect(trimmed.length).toBeGreaterThanOrEqual(5);
    expect(trimmed.length).toBeLessThanOrEqual(9);
    expect(trimmed[trimmed.length - 1].t).toBe(isoDaysAgo(0));
  });

  it("falls back to the last trading week when the trim is too aggressive", () => {
    const bars = Array.from({ length: 10 }, (_, i) =>
      mk(`2020-01-${String(i + 1).padStart(2, "0")}`),
    );
    expect(trimToDays(bars, 7)).toHaveLength(5);
  });

  it("handles empty input", () => {
    expect(trimToDays([], 7)).toEqual([]);
  });
});

describe("sessionBars", () => {
  const bar = (t: string, c: number, extra: Partial<Bar> = {}): Bar => ({
    t,
    o: c,
    h: c,
    l: c,
    c,
    v: 100,
    ...extra,
  });
  const quote = (over: Partial<Quote> = {}): Quote => ({
    symbol: "AAPL",
    name: "Apple Inc.",
    kind: "stock",
    price: 330,
    change: 0,
    changePct: 0,
    previousClose: 330,
    open: null,
    high: null,
    low: null,
    volume: 1_000,
    date: "2026-10-02",
    currency: "USD",
    exchange: "NASDAQ",
    marketCap: null,
    high52w: null,
    low52w: null,
    extended: null,
    session: "open",
    ...over,
  });

  it("keeps the last two sessions when there is no usable quote", () => {
    const bars = [
      bar("2026-09-30", 320),
      bar("2026-10-01", 325),
      bar("2026-10-02", 330),
    ];
    expect(sessionBars(bars, null).map((b) => b.t)).toEqual([
      "2026-10-01",
      "2026-10-02",
    ]);
    // A quote without a date (CNBC-only fallback) must not be invented.
    expect(sessionBars(bars, quote({ date: "" })).map((b) => b.t)).toEqual([
      "2026-10-01",
      "2026-10-02",
    ]);
  });

  it("appends a live session newer than the last daily bar", () => {
    const bars = [
      bar("2026-10-01", 325, { h: 328, l: 322 }),
      bar("2026-10-02", 330, { h: 333, l: 328 }),
    ];
    const out = sessionBars(
      bars,
      quote({ date: "2026-10-05", price: 340, open: 331, high: 342, low: 329, volume: 5_000 }),
    );
    expect(out).toHaveLength(2);
    expect(out[0].t).toBe("2026-10-02");
    expect(out[1]).toMatchObject({
      t: "2026-10-05",
      o: 331,
      h: 342,
      l: 329,
      c: 340,
      v: 5_000,
    });
  });

  it("refreshes the same-day bar with live values without shrinking its range", () => {
    const bars = [
      bar("2026-10-01", 325),
      bar("2026-10-02", 330, { o: 328, h: 335, l: 326, v: 900 }),
    ];
    const out = sessionBars(
      bars,
      quote({ date: "2026-10-02", price: 332, open: null, high: null, low: null }),
    );
    expect(out).toHaveLength(2);
    const live = out[1];
    expect(live.t).toBe("2026-10-02");
    expect(live.c).toBe(332); // live price wins
    expect(live.o).toBe(328); // quote has no open → keep the daily bar's
    expect(live.h).toBe(335); // never below the real daily high
    expect(live.l).toBe(326); // never above the real daily low
    expect(live.v).toBe(1_000); // quote volume wins when present
  });

  it("ignores a quote older than the last bar", () => {
    const bars = [bar("2026-10-01", 325), bar("2026-10-02", 330)];
    const out = sessionBars(bars, quote({ date: "2026-09-30", price: 300 }));
    expect(out.map((b) => b.t)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(out[1].c).toBe(330);
  });

  it("handles empty input", () => {
    expect(sessionBars([], null)).toEqual([]);
    expect(sessionBars([], quote())).toEqual([]);
  });
});

describe("parseNum / parseCompact", () => {
  it("parses grouped and signed numbers", () => {
    expect(parseNum("1,234.56")).toBe(1234.56);
    expect(parseNum("+0.35%")).toBe(0.35);
    expect(parseNum("-0.81%")).toBe(-0.81);
    expect(parseNum("(2.5)")).toBe(-2.5);
  });

  it("returns null for blanks and junk", () => {
    expect(parseNum("")).toBeNull();
    expect(parseNum(null)).toBeNull();
    expect(parseNum(undefined)).toBeNull();
    expect(parseNum("N/A")).toBeNull();
  });

  it("parses compact suffixed values", () => {
    expect(parseCompact("4.821T")).toBeCloseTo(4.821e12, -6);
    expect(parseCompact("466.823B")).toBeCloseTo(466.823e9, -3);
    expect(parseCompact("221.7K")).toBeCloseTo(221700, -1);
    expect(parseCompact("12.5M")).toBeCloseTo(12.5e6, -1);
  });

  it("falls back to plain parse for unsuffixed values", () => {
    expect(parseCompact("500")).toBe(500);
    expect(parseCompact(null)).toBeNull();
  });
});

describe("parseCnbcQuotes", () => {
  // Shape verified against CNBC restQuote webservice.
  const payload = {
    FormattedQuoteResult: {
      FormattedQuote: [
        {
          symbol: "AAPL",
          name: "Apple Inc.",
          type: "STOCK",
          last: "330.32",
          change: "-2.70",
          change_pct: "-0.81%",
          volume: "32,843,065",
          exchange: "NASDAQ",
          curmktstatus: "PRE_MKT",
          yrhiprice: "345.34",
          yrloprice: "243.42",
          mktcapView: "4.821T",
          pe: "38.01",
          eps: "8.69",
          dividendyield: "0.33%",
          beta: "1.08",
          revenuettm: "466.823B",
          ROETTM: "148.19%",
          ExtendedMktQuote: {
            last: "331.40",
            change_pct: "+0.33%",
            last_timedate: "8:10 AM EDT",
          },
          EventData: { next_earnings_date: "10/28/2026(est)" },
        },
        {
          symbol: ".SPX",
          name: "S&P 500 Index",
          type: "INDEX",
          last: "7,666.45",
          change: "+14.91",
          change_pct: "+0.19%",
          curmktstatus: "REG_MKT",
        },
      ],
    },
  };

  it("maps stock quotes with fundamentals", () => {
    const [aapl, spx] = parseCnbcQuotes(payload);
    expect(aapl.symbol).toBe("AAPL");
    expect(aapl.price).toBe(330.32);
    expect(aapl.changePct).toBe(-0.81);
    expect(aapl.previousClose).toBeCloseTo(333.02, 2);
    expect(aapl.marketCap).toBeCloseTo(4.821e12, -6);
    expect(aapl.volume).toBe(32843065);
    expect(aapl.session).toBe("pre");
    expect(aapl.extended?.price).toBe(331.4);
    expect(aapl.stats.pe).toBe(38.01);
    expect(aapl.stats.eps).toBe(8.69);
    expect(aapl.stats.dividendYield).toBe(0.33);
    expect(aapl.stats.revenueTtm).toBeCloseTo(466.823e9, -3);
    expect(aapl.stats.nextEarnings).toBe("10/28/2026(est)");

    expect(spx.kind).toBe("index");
    expect(spx.price).toBe(7666.45);
    expect(spx.session).toBe("open");
    expect(spx.previousClose).toBeCloseTo(7651.54, 2);
  });

  it("skips rows without a price", () => {
    const out = parseCnbcQuotes({
      FormattedQuoteResult: {
        FormattedQuote: [{ symbol: "BAD" }, { name: "no symbol", last: "1" }],
      },
    });
    expect(out).toHaveLength(0);
  });

  it("handles empty payloads", () => {
    expect(parseCnbcQuotes(null)).toEqual([]);
    expect(parseCnbcQuotes({})).toEqual([]);
  });
});

describe("parseMovers", () => {
  // Shape verified against scanner.tradingview.com/america/scan.
  const payload = {
    totalCount: 2831,
    data: [
      {
        s: "NASDAQ:MAT",
        d: ["MAT", 15.04, 18.799, 2.38, 35717313, 4296928173, "Mattel, Inc.", "NASDAQ"],
      },
      {
        s: "NYSE:ACN",
        d: ["ACN", 212.3, 15.777, 28.93, 28986118, 129915317908, "Accenture plc", "NYSE"],
      },
    ],
  };

  it("maps scanner rows to movers", () => {
    const movers = parseMovers(payload);
    expect(movers).toHaveLength(2);
    expect(movers[0]).toEqual({
      symbol: "MAT",
      name: "Mattel, Inc.",
      price: 15.04,
      changePct: 18.799,
      change: 2.38,
      volume: 35717313,
      marketCap: 4296928173,
      exchange: "NASDAQ",
    });
    expect(movers[1].symbol).toBe("ACN");
  });

  it("handles rows without exchange prefix", () => {
    const movers = parseMovers({ data: [{ s: "FOO", d: ["FOO", 10, 1, 0.1, 100, null, "Foo Corp", ""] }] });
    expect(movers[0].symbol).toBe("FOO");
    expect(movers[0].marketCap).toBeNull();
  });

  it("handles empty payloads", () => {
    expect(parseMovers(null)).toEqual([]);
    expect(parseMovers({})).toEqual([]);
    expect(parseMovers({ data: [{ s: "X" }] })).toEqual([]);
  });
});

describe("parseNews", () => {
  const payload = {
    status: "ok",
    feed: { title: "US Top News and Analysis" },
    items: [
      {
        title: "Oil prices fall over 3%",
        link: "https://www.cnbc.com/2026/10/02/oil.html",
        pubDate: "2026-10-02 09:34:33",
      },
      {
        title: "S&P climbs",
        link: "https://example.com/sp",
        pubDate: "2026-10-02 08:00:00",
        author: "Reuters",
      },
    ],
  };

  it("maps items and resolves source fallbacks", () => {
    const items = parseNews(payload, "CNBC");
    expect(items).toHaveLength(2);
    expect(items[0].source).toBe("US Top News and Analysis"); // feed title fallback
    expect(items[1].source).toBe("Reuters"); // author wins over feed title
    expect(items[0].url).toBe("https://www.cnbc.com/2026/10/02/oil.html");
    expect(items[0].publishedAt).toBe("2026-10-02 09:34:33");
  });

  it("prefers explicit source field", () => {
    const items = parseNews(
      { status: "ok", items: [{ title: "t", link: "l", source: "Bloomberg" }] },
      "X",
    );
    expect(items[0].source).toBe("Bloomberg");
  });

  it("returns empty for failed or missing payloads", () => {
    expect(parseNews(null, "X")).toEqual([]);
    expect(parseNews({ status: "error" }, "X")).toEqual([]);
    expect(parseNews({ status: "ok" }, "X")).toEqual([]);
    expect(parseNews({ status: "ok", items: [{ title: "no link" }] }, "X")).toEqual([]);
  });
});
