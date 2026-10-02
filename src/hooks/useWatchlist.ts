/** React hook around the localStorage watchlist store. */

import { useCallback, useState } from "react";
import {
  DEFAULT_WATCHLIST,
  addWatchlist,
  loadWatchlist,
  removeWatchlist,
  saveWatchlist,
  toggleWatchlist,
} from "../lib/watchlist";

export function useWatchlist() {
  const [symbols, setSymbols] = useState<string[]>(() => loadWatchlist());

  const toggle = useCallback((symbol: string) => {
    setSymbols((prev) => toggleWatchlist(prev, symbol));
  }, []);

  const add = useCallback((symbol: string) => {
    setSymbols((prev) => addWatchlist(prev, symbol));
  }, []);

  const remove = useCallback((symbol: string) => {
    setSymbols((prev) => removeWatchlist(prev, symbol));
  }, []);

  const reset = useCallback(() => {
    setSymbols(saveWatchlist(DEFAULT_WATCHLIST));
  }, []);

  return { symbols, toggle, add, remove, reset };
}
