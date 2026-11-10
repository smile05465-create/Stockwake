# Stockwake

**Wake up to the market.** Stockwake is a fast, free, no-signup stock market terminal: latest
quotes, interactive charts, market movers, news and a persistent watchlist — in one focused
dark-themed UI that works on desktop and phone.

> Data comes from public market feeds and is for information only — **not investment advice**.

## Features

- **Landing page** with an index pulse (S&P 500, Dow, Nasdaq, VIX) and a clear path into the dashboard.
- **Markets dashboard** (`#/markets`) — index strip, gainers / losers / most-active movers,
  watchlist snapshot and market headlines.
- **Watchlist** (`#/watchlist`) — add symbols via search or the detail page's
  **Add to Watchlist** button, summary strip, quote grid with price, daily change, volume and
  market cap, plus market headlines.
  Persisted in `localStorage` (up to 30 symbols), so it survives refreshes and browser restarts.
- **Symbol detail** (`#/symbol/AAPL`) — symbol, company name, latest price with daily change and
  percent, session badge (pre/open/post/closed), volume / market cap / exchange meta,
  1D–5Y interactive SVG chart (1D, 1W, 1M, 3M, 1Y, 5Y pills) with hover crosshair and volume,
  52-week position bar, key statistics, per-symbol news and a one-tap **Add to Watchlist** button.
  Data is labeled honestly: daily bars for charts, "as of" dates for quotes — no real-time claims.
- **Global ticker search** — debounced, keyboard-navigable, jumps straight to detail pages.
- Fully responsive: dedicated mobile nav row, touch-friendly controls, no hover-only affordances.

## Tech stack

| Layer     | Choice                                                   |
| --------- | -------------------------------------------------------- |
| Build     | [Vite 7](https://vite.dev) + TypeScript 5.9 (strict)      |
| UI        | React 19 + Tailwind CSS v4 (`@theme` design tokens)       |
| Routing   | react-router-dom v7 (`HashRouter`)                        |
| Tests     | Vitest 3 (unit, render smoke, opt-in live) + Playwright layout/smoke checks |
| Package   | Bun (npm/pnpm/yarn work too)                              |

No backend, no database, no accounts, no payments — everything runs client-side.

## Data sources (keyless, CORS-friendly)

| Provider                  | Used for                                            |
| ------------------------- | --------------------------------------------------- |
| Nasdaq trader symbol directory | symbol search, via a bundled local index (see below) |
| stockanalysis.com API     | latest quotes, daily OHLCV history                   |
| CNBC restQuote webservice | batch quotes, index quotes, fundamentals             |
| TradingView scanner       | gainers / losers / most-active tables                |
| rss2json + CNBC/Google News RSS | market news and per-symbol headlines          |

Responses are cached in-memory with a short TTL plus single-flight dedupe so the free feeds
are never hammered. Quotes refresh themselves every minute while the tab is visible; headlines
every five. A refresh never blanks the screen.

**Symbol search runs locally.** `public/tickers.json` holds every US-listed stock and ETF
(~12,900 symbols) generated from the free Nasdaq directory by `scripts/build-tickers.mjs`; the app
matches in memory. No request per keystroke, nothing to rate-limit, works offline after first load.

**Price history needs a relay in production.** stockanalysis.com answers CORS from `localhost` but
not from public origins, so the chart's history call fails once the site is deployed while working
perfectly in local development. Set `VITE_HISTORY_PROXY` to a small endpoint that forwards
`?p=<path>` to `https://stockanalysis.com/api/` and returns it with `Access-Control-Allow-Origin`,
and history starts working again with no other code change. Without it the chart says so plainly
and the quote, statistics and news keep working.

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
| `bun run test:layout`  | Playwright layout check at 360–1280px         |
| `bun run test:smoke`   | Playwright walk-through of the real user path |
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
- `scripts/layout-check.mjs` — renders the app at phone/tablet/desktop widths and asserts real
  geometry: no overflow, no sideways scroll, every control in bounds.
- `scripts/smoke-check.mjs` — landing → markets → search → symbol → watchlist → reload, with feed
  outages reported as SKIP rather than a false PASS.

## Deploying

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy-pages.yml`).
Enable it once: Settings → Pages → Source **GitHub Actions**. The build uses `--base=/Stockwake/`
to match a project page.
