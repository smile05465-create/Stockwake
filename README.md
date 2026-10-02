# Stockwake

**Wake up to the market.** Stockwake is a fast, free, no-signup stock market terminal: live
quotes, interactive charts, market movers, news and a persistent watchlist — in one focused
dark-themed UI that works on desktop and phone.

> Data comes from public market feeds and is for information only — **not investment advice**.

## Features

- **Landing page** with a live index pulse (S&P 500, Dow, Nasdaq, VIX) and a clear path into the dashboard.
- **Markets dashboard** (`#/markets`) — index strip, gainers / losers / most-active movers,
  watchlist snapshot and market headlines.
- **Watchlist** (`#/watchlist`) — add symbols via search, summary strip, quote grid.
  Persisted in `localStorage` (up to 30 symbols), so it survives refreshes and browser restarts.
- **Symbol detail** (`#/symbol/AAPL`) — live quote with session badge (pre/open/post/closed),
  1M–5Y interactive SVG chart with hover crosshair and volume, key statistics and per-symbol news.
- **Global ticker search** — debounced, keyboard-navigable, jumps straight to detail pages.
- Fully responsive: dedicated mobile nav row, touch-friendly controls, no hover-only affordances.

## Tech stack

| Layer     | Choice                                                   |
| --------- | -------------------------------------------------------- |
| Build     | [Vite 7](https://vite.dev) + TypeScript 5.9 (strict)      |
| UI        | React 19 + Tailwind CSS v4 (`@theme` design tokens)       |
| Routing   | react-router-dom v7 (`HashRouter`)                        |
| Tests     | Vitest 3 (unit, render smoke, opt-in live integration)    |
| Package   | Bun (npm/pnpm/yarn work too)                              |

No backend, no database, no accounts, no payments — everything runs client-side.

## Data sources (keyless, CORS-friendly)

| Provider                  | Used for                                            |
| ------------------------- | --------------------------------------------------- |
| stockanalysis.com API     | symbol search, latest quotes, daily OHLCV history    |
| CNBC restQuote webservice | batch quotes, index quotes, fundamentals             |
| TradingView scanner       | gainers / losers / most-active tables                |
| rss2json + CNBC/Google News RSS | market news and per-symbol headlines          |

Responses are cached in-memory with a short TTL plus single-flight dedupe so the free feeds
are never hammered.

## Getting started

```bash
bun install        # or: npm install
bun run dev        # dev server on http://localhost:5173
```

## Scripts

| Command                | What it does                                  |
| ---------------------- | --------------------------------------------- |
| `bun run dev`          | start the Vite dev server                     |
| `bun run typecheck`    | `tsc -b --noEmit` — full project type check   |
| `bun run test`         | run the unit + render test suite              |
| `STOCKWAKE_LIVE=1 bun run test` | also runs live integration tests against the real feeds |
| `bun run build`        | typecheck + production build into `dist/`     |

## Project structure

```
src/
  components/   Layout, SearchBox, PriceChart, QuoteCard, MoversTable, NewsList
  hooks/        useAsync (stale-guarded loader), useWatchlist (localStorage)
  lib/          api.ts (providers + pure parsers), cache, format, types, watchlist
  pages/        Landing, Markets, Watchlist, SymbolPage, NotFound
  App.tsx       routes      main.tsx  (HashRouter bootstrap)
```

## Testing

- `src/lib/*.test.ts` — parsers, cache, formatting, watchlist store (incl. persistence round-trip).
- `src/app.smoke.test.tsx` — server-renders every route through the real router and layout.
- `src/lib/live.integration.test.ts` — opt-in end-to-end checks of search, quotes, history,
  movers and news against the live feeds (`STOCKWAKE_LIVE=1`).
