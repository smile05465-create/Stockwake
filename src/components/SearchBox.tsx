/** Debounced symbol search with keyboard navigation in the header. */

import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { searchSymbols } from "../lib/api";
import type { SearchHit } from "../lib/types";
import { useAsync } from "../hooks/useAsync";

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Debounce keystrokes by 250ms before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: hits, loading } = useAsync<SearchHit[]>(
    () => searchSymbols(debounced),
    [debounced],
  );

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const results = hits ?? [];

  function go(symbol: string) {
    setOpen(false);
    setQuery("");
    navigate(`/symbol/${encodeURIComponent(symbol)}`);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      const pick = results[active];
      if (pick) go(pick.symbol);
      else if (query.trim()) go(query.trim().toUpperCase());
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && debounced.trim().length > 0;

  return (
    <div ref={boxRef} className="relative w-full max-w-xs sm:max-w-sm">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search ticker or company…"
        aria-label="Search symbols"
        className="w-full rounded-lg bg-ink-850 border border-ink-600 px-3 py-2 text-sm
                   text-slate-100 placeholder:text-slate-500 outline-none
                   focus:border-flare-500/70 focus:ring-2 focus:ring-flare-500/20 transition-colors"
      />
      {showDropdown && (
        <div className="absolute right-0 left-0 mt-2 rounded-xl border border-ink-600 bg-ink-900 shadow-2xl shadow-black/50 overflow-hidden">
          {loading && results.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">
              No matches for “{debounced}”
            </div>
          )}
          {results.map((hit, i) => (
            <button
              key={`${hit.symbol}-${hit.name}`}
              type="button"
              onClick={() => go(hit.symbol)}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                i === active ? "bg-ink-800" : "hover:bg-ink-850"
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <span className="num font-semibold text-flare-300 shrink-0">{hit.symbol}</span>
                <span className="truncate text-slate-400">{hit.name}</span>
              </span>
              <span
                className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0 ${
                  hit.kind === "etf"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-emerald-500/15 text-emerald-300"
                }`}
              >
                {hit.kind}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
