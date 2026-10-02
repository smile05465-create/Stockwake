/** React hook around the localStorage watchlist store. */

import { useCallback, useState } from "react";
import {
  addWatchlist,
  loadWatchlist,
  removeWatchlist,
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

  return { symbols, toggle, add, remove };
}
