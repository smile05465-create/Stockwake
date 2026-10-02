/** Debounced symbol search with keyboard navigation in the header. */

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { searchSymbols } from "../lib/api";
import type { SearchHit } from "../lib/types";
import { useAsync } from "../hooks/useAsync";

/** Ticker-shaped input that is safe to deep-link without a search hit. */
const TICKER_LIKE = /^[A-Za-z0-9.\-^]{1,12}$/;

export default function SearchBox() {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const listId = useId();

  // Debounce keystrokes by 250ms before hitting the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  // Results are tagged with the term that produced them, so a slow response
  // can never be rendered — or Enter-picked — for a newer query.
  const { data, error, reload } = useAsync(
    async (): Promise<{ term: string; items: SearchHit[] }> => ({
      term: debounced.trim(),
      items: await searchSymbols(debounced),
    }),
    [debounced],
  );

  const term = debounced.trim();
  // `fresh` is null until results for the *current* term arrive.
  const fresh = data && data.term === term ? data.items : null;
  const results: SearchHit[] = fresh ?? [];
  const waiting = !fresh && !error;

  // Close the dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(symbol: string) {
    setOpen(false);
    setQuery("");
    navigate(`/symbol/${encodeURIComponent(symbol)}`);
  }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.max(0, Math.min(a + 1, results.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const pick = fresh ? results[active] : undefined;
      if (pick) {
        go(pick.symbol);
      } else if (fresh && fresh.length === 0 && TICKER_LIKE.test(term)) {
        // No match yet — a ticker-shaped query still deserves a direct page.
        go(term.toUpperCase());
      }
      // While results are loading, Enter is ignored rather than guessing.
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showDropdown = open && term.length > 0;
  const optionId = (i: number) => `${listId}-option-${i}`;

  return (
    <div ref={boxRef} className="relative w-full min-w-0 max-w-xs sm:max-w-sm">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        onBlur={(e) => {
          // Close when focus genuinely leaves the search widget.
          if (!boxRef.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
        }}
        placeholder="Search ticker or company…"
        aria-label="Search symbols"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showDropdown && results.length > 0 ? optionId(active) : undefined}
        className="w-full min-w-0 rounded-lg bg-ink-850 border border-ink-600 px-3 py-2 text-sm
                   text-slate-100 placeholder:text-slate-500 outline-none
                   focus:border-flare-500/70 focus:ring-2 focus:ring-flare-500/20 transition-colors"
      />
      {showDropdown && (
        <div
          id={listId}
          role="listbox"
          aria-label="Search results"
          className="absolute right-0 left-auto mt-2 w-[min(86vw,20rem)] sm:left-0 sm:right-0 sm:w-auto
                        max-h-[65vh] overflow-y-auto overscroll-contain
                        rounded-xl border border-ink-600 bg-ink-900 shadow-2xl shadow-black/50"
        >
          {waiting && (
            <div className="px-3 py-3 text-sm text-slate-500" role="status">
              Searching…
            </div>
          )}
          {error && !fresh && (
            <div className="px-3 py-3 text-sm text-slate-500">
              Search is unavailable right now.{" "}
              <button
                type="button"
                // Keep focus inside the widget so the dropdown survives the click.
                onMouseDown={(e) => e.preventDefault()}
                onClick={reload}
                className="text-flare-400 hover:text-flare-300 underline"
              >
                Retry
              </button>
            </div>
          )}
          {fresh && results.length === 0 && (
            <div className="px-3 py-3 text-sm text-slate-500">No matches for “{term}”</div>
          )}
          {fresh &&
            results.map((hit, i) => (
              <button
                key={`${hit.symbol}-${hit.name}`}
                id={optionId(i)}
                type="button"
                role="option"
                aria-selected={i === active}
                // Keep focus in the input so blur never removes this before click.
                onMouseDown={(e) => e.preventDefault()}
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
