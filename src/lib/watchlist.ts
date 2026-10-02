/**
 * Persistent watchlist backed by localStorage.
 * Symbols are stored as plain tickers in display order.
 * All mutation helpers are pure (state in, state out) so they can be unit-tested.
 */

const STORAGE_KEY = "stockwake.watchlist.v1";
const MAX_SYMBOLS = 30;

export const DEFAULT_WATCHLIST = ["AAPL", "MSFT", "NVDA", "SPY", "TSLA"];

function safeRead(): string[] | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const symbols = parsed.filter((s): s is string => typeof s === "string" && s.length > 0);
    return dedupe(symbols).slice(0, MAX_SYMBOLS);
  } catch {
    return null;
  }
}

function safeWrite(symbols: string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
  } catch {
    // Storage unavailable (private mode / quota) — watchlist stays in-memory.
  }
}

/** Remove duplicates, keeping the first occurrence; uppercase tickers. */
export function dedupe(symbols: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of symbols) {
    const s = raw.trim().toUpperCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

/** Load the watchlist, falling back to defaults when nothing is stored. */
export function loadWatchlist(): string[] {
  const stored = safeRead();
  if (stored && stored.length > 0) return stored;
  return [...DEFAULT_WATCHLIST];
}

/** Persist a watchlist (returns the normalized list). */
export function saveWatchlist(symbols: string[]): string[] {
  const next = dedupe(symbols).slice(0, MAX_SYMBOLS);
  safeWrite(next);
  return next;
}

/** Toggle membership: returns the new list with symbol added or removed. */
export function toggleWatchlist(symbols: string[], symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!s) return symbols;
  return symbols.includes(s)
    ? saveWatchlistInline(symbols.filter((x) => x !== s))
    : saveWatchlistInline([...symbols, s]);
}

/** Add if missing (no-op otherwise); enforces the cap. */
export function addWatchlist(symbols: string[], symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!s || symbols.includes(s)) return symbols;
  return saveWatchlistInline([...symbols, s]);
}

/** Remove if present (no-op otherwise). */
export function removeWatchlist(symbols: string[], symbol: string): string[] {
  const s = symbol.trim().toUpperCase();
  if (!symbols.includes(s)) return symbols;
  return saveWatchlistInline(symbols.filter((x) => x !== s));
}

function saveWatchlistInline(symbols: string[]): string[] {
  const next = dedupe(symbols).slice(0, MAX_SYMBOLS);
  safeWrite(next);
  return next;
}
