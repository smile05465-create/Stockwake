import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_WATCHLIST,
  addWatchlist,
  dedupe,
  loadWatchlist,
  removeWatchlist,
  toggleWatchlist,
} from "./watchlist";

describe("dedupe", () => {
  it("uppercases, trims, and removes duplicates preserving order", () => {
    expect(dedupe([" aapl ", "MSFT", "aapl", " nvda "])).toEqual(["AAPL", "MSFT", "NVDA"]);
  });

  it("drops empties", () => {
    expect(dedupe(["", "  ", "X"])).toEqual(["X"]);
  });
});

describe("toggleWatchlist", () => {
  it("adds a missing symbol", () => {
    const out = toggleWatchlist(["AAPL"], "MSFT");
    expect(out).toEqual(["AAPL", "MSFT"]);
  });

  it("removes a present symbol", () => {
    const out = toggleWatchlist(["AAPL", "MSFT"], "AAPL");
    expect(out).toEqual(["MSFT"]);
  });

  it("normalizes case and whitespace", () => {
    const out = toggleWatchlist(["AAPL"], "  msft ");
    expect(out).toEqual(["AAPL", "MSFT"]);
  });

  it("ignores empty input", () => {
    expect(toggleWatchlist(["AAPL"], "   ")).toEqual(["AAPL"]);
  });
});

describe("addWatchlist", () => {
  it("appends new symbols", () => {
    expect(addWatchlist(["AAPL"], "NVDA")).toEqual(["AAPL", "NVDA"]);
  });

  it("is a no-op for duplicates", () => {
    expect(addWatchlist(["AAPL"], "AAPL")).toEqual(["AAPL"]);
  });

  it("caps at 30 symbols", () => {
    const many = Array.from({ length: 30 }, (_, i) => `S${i}`);
    const out = addWatchlist(many, "EXTRA");
    expect(out).toHaveLength(30);
    expect(out).not.toContain("EXTRA");
  });
});

describe("removeWatchlist", () => {
  it("removes present symbols", () => {
    expect(removeWatchlist(["AAPL", "MSFT"], "AAPL")).toEqual(["MSFT"]);
  });

  it("is a no-op for absent symbols", () => {
    expect(removeWatchlist(["AAPL"], "TSLA")).toEqual(["AAPL"]);
  });
});

describe("defaults", () => {
  it("ships a non-empty starter list", () => {
    expect(DEFAULT_WATCHLIST.length).toBeGreaterThan(0);
    expect(DEFAULT_WATCHLIST).toEqual(
      [...new Set(DEFAULT_WATCHLIST.map((s) => s.toUpperCase()))],
    );
  });
});

/**
 * Persistence: the real store reads/writes window.localStorage, which does
 * not exist under the node test environment. We stub it with an in-memory
 * Map and simulate a page refresh by re-reading through loadWatchlist().
 */
describe("localStorage persistence", () => {
  const STORAGE_KEY = "stockwake.watchlist.v1";
  const globals = globalThis as { window?: unknown };
  let mem: Map<string, string>;

  beforeEach(() => {
    mem = new Map();
    globals.window = {
      localStorage: {
        getItem: (k: string) => mem.get(k) ?? null,
        setItem: (k: string, v: string) => {
          mem.set(k, v);
        },
        removeItem: (k: string) => {
          mem.delete(k);
        },
      },
    };
  });

  afterEach(() => {
    delete globals.window;
  });

  it("a toggle survives a simulated refresh", () => {
    toggleWatchlist([], "amd");
    // Refresh = a fresh load from the same storage backing.
    expect(loadWatchlist()).toEqual(["AMD"]);
  });

  it("adds and removes persist to storage", () => {
    const added = addWatchlist(DEFAULT_WATCHLIST, "AMD");
    expect(loadWatchlist()).toContain("AMD");
    removeWatchlist(added, "AMD");
    expect(loadWatchlist()).not.toContain("AMD");
    expect(loadWatchlist()).toEqual([...DEFAULT_WATCHLIST]);
  });

  it("falls back to defaults when nothing is stored", () => {
    expect(loadWatchlist()).toEqual(DEFAULT_WATCHLIST);
  });

  it("falls back to defaults on corrupt storage instead of crashing", () => {
    mem.set(STORAGE_KEY, "{not-json");
    expect(loadWatchlist()).toEqual(DEFAULT_WATCHLIST);
  });

  it("ignores non-array payloads", () => {
    mem.set(STORAGE_KEY, JSON.stringify({ hack: true }));
    expect(loadWatchlist()).toEqual(DEFAULT_WATCHLIST);
  });
});
