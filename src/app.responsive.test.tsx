/**
 * Responsive design contract tests.
 *
 * There is no pixel-level layout engine under the node test environment, so
 * these tests lock the *breakpoint contracts* that produce the responsive
 * behavior. Tailwind tiers used by the app:
 *
 *   360px / 390px / 430px  → base styles        (below `sm` = 640)
 *   small tablet (640–767) → `sm`
 *   tablet (768–1023)      → `md`
 *   desktop (1024+)        → `lg`
 *
 * Every test asserts the rendered markup of the real routes/components, so a
 * regression that removes a mobile layout (or leaks a fixed-width desktop
 * element into phones) fails the suite.
 */

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import App from "./App";
import MoversTable from "./components/MoversTable";
import QuoteCard from "./components/QuoteCard";
import PriceChart from "./components/PriceChart";
import type { Bar, Quote } from "./lib/types";

function renderAt(path: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

const FIXTURE_QUOTE: Quote = {
  symbol: "AAPL",
  name: "Apple Inc.",
  kind: "stock",
  price: 333.52,
  change: 3.2,
  changePct: 0.97,
  previousClose: 330.32,
  open: 333.26,
  high: 344.54,
  low: 330.61,
  volume: 17_296_160,
  date: "2026-10-02",
  currency: "USD",
  exchange: "NASDAQ",
  marketCap: 5_000_000_000_000,
  high52w: 345.34,
  low52w: 243.42,
  extended: null,
  session: "open",
};

const FIXTURE_BARS: Bar[] = [
  { t: "2026-09-29", o: 320, h: 325, l: 318, c: 322, v: 1_000_000 },
  { t: "2026-09-30", o: 322, h: 330, l: 321, c: 328, v: 1_200_000 },
  { t: "2026-10-01", o: 328, h: 334, l: 326, c: 331, v: 900_000 },
  { t: "2026-10-02", o: 331, h: 336, l: 329, c: 334, v: 1_500_000 },
];

describe("phones (360 / 390 / 430px — everything below sm=640)", () => {
  const markets = renderAt("/markets");

  it("never scrolls the page sideways: app shell clips stray overflow", () => {
    expect(markets).toContain("overflow-x-clip");
  });

  it("shows the mobile nav row so every page is reachable without hover", () => {
    expect(markets).toContain("sm:hidden"); // mobile nav row in the header
    expect(markets).toContain('href="/watchlist"');
    expect(markets).toContain('href="/markets"');
    // Mobile nav links use a taller touch target than the desktop nav.
    expect(markets).toContain("px-3 py-2 rounded-md");
  });

  it("keeps the desktop nav hidden on phones", () => {
    expect(markets).toContain("hidden sm:flex");
  });

  it("fits the search bar to phone width", () => {
    expect(markets).toContain("min-w-0"); // flex child can shrink below content width
    expect(markets).toContain("max-w-xs"); // phone-friendly cap
    expect(markets).toContain('aria-label="Search symbols"');
    // Search exposes combobox semantics for screen readers (listbox renders on focus).
    expect(markets).toContain('role="combobox"');
    expect(markets).toContain('aria-expanded="false"');
  });

  it("renders the movers card with stacked header and tab controls", () => {
    // Data rows are gated on fetched movers (absent during SSR); the card,
    // its stacked header and the tabs always render.
    expect(markets).toContain("Market movers");
    expect(markets).toContain("Gainers");
    expect(markets).toContain("Most active");
    // Movers data + card/table markup itself is covered in the lg section below.
  });

  it("stacks the movers card header below sm", () => {
    expect(markets).toContain("flex-col gap-2 sm:flex-row");
  });

  it("shows the watchlist snapshot as a single column on phones", () => {
    expect(markets).toContain("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3");
  });

  it("keeps the phone layout single-column on the watchlist page", () => {
    const watchlist = renderAt("/watchlist");
    // Quote cards: 1 column on phones, 2 at sm, 3 at lg (skeleton + live grid).
    expect(watchlist).toContain("grid gap-3 sm:grid-cols-2 lg:grid-cols-3");
    // Empty-state guidance still points at the search control.
    expect(watchlist).toContain("Add symbol");
  });

  it("stacks the symbol page chart header and wraps badges", () => {
    const symbol = renderAt("/symbol/AAPL");
    // Title + range switcher stack vertically, side-by-side from sm up.
    expect(symbol).toContain("flex-col gap-3 sm:flex-row");
    // Range pills hug their content on phones (w-fit) and get bigger tap targets
    // below lg; desktop (lg+) keeps the original compact sizing.
    expect(symbol).toContain("flex w-fit rounded-lg bg-ink-850");
    expect(symbol).toContain("px-3 py-2 sm:px-2 sm:py-1.5 lg:py-1");
    // Exactly six range pills render: 1D / 1W / 1M / 3M / 1Y / 5Y.
    const pillCount = (
      symbol.match(/px-3 py-2 sm:px-2 sm:py-1\.5 lg:py-1/g) ?? []
    ).length;
    expect(pillCount).toBe(6);
    for (const label of ["1D", "1W", "1M", "3M", "1Y", "5Y"]) {
      expect(symbol).toContain(`>${label}</button>`);
    }
    // Session badge row wraps instead of overflowing at 360px.
    expect(symbol).toContain("flex flex-wrap items-center gap-3");
    // Clear watchlist CTA with a comfortable touch target (add state for a
    // symbol outside the default watchlist, remove state otherwise).
    expect(symbol).toMatch(/Add to Watchlist|Remove from Watchlist/);
    expect(renderAt("/symbol/AMD")).toContain("Add to Watchlist");
    expect(symbol).toContain("px-4 py-2");
    // Detail header meta row: volume, market cap and exchange are visible
    // without scrolling into the statistics card.
    expect(symbol).toContain("Volume");
    expect(symbol).toContain("Market cap");
    expect(symbol).toContain("Exchange");
  });

  it("keeps landing index cards two-up on phones", () => {
    const landing = renderAt("/");
    expect(landing).toContain("grid-cols-2 sm:grid-cols-4");
  });
});

describe("tablet (768px — md tier)", () => {
  it("uses an intermediate two-pane markets layout from md up", () => {
    const markets = renderAt("/markets");
    expect(markets).toContain("md:grid-cols-5");
    expect(markets).toContain("md:col-span-3");
    expect(markets).toContain("md:col-span-2");
  });

  it("uses a three-column index strip from md up", () => {
    expect(renderAt("/markets")).toContain("md:grid-cols-3");
  });

  it("keeps the desktop nav row visible from sm up", () => {
    expect(renderAt("/markets")).toContain("hidden sm:flex");
  });
});

describe("desktop (1024px+ — lg tier)", () => {
  it("shows the original movers table (unchanged desktop design)", () => {
    const movers = renderToString(
      <MemoryRouter>
        <MoversTable
          tab="gainers"
          onTabChange={() => {}}
          movers={[
            {
              symbol: "NVDA",
              name: "NVIDIA Corporation",
              price: 180.45,
              changePct: 4.12,
              change: 7.13,
              volume: 220_000_000,
              marketCap: 4_400_000_000_000,
              exchange: "NASDAQ",
            },
          ]}
          loading={false}
          error={null}
        />
      </MemoryRouter>,
    );
    // Desktop table markup intact with all five columns and its min width…
    expect(movers).toContain("hidden lg:block");
    expect(movers).toContain("min-w-[540px]");
    expect(movers).toContain("<table");
    expect(movers).toContain("Mkt cap");
    // …and the mobile card list carries the same data fields.
    expect(movers).toContain("lg:hidden");
    expect(movers).toContain("Vol ");
    expect(movers).toContain("Cap ");
    expect(movers).toContain("NASDAQ");
  });

  it("keeps the watchlist grid three-column at lg", () => {
    expect(renderAt("/markets")).toContain("lg:grid-cols-3");
    expect(renderAt("/watchlist")).toContain("lg:grid-cols-3");
  });
});

describe("components at fixed sizes", () => {
  it("quote card remove button is a comfortable tap target on phones", () => {
    const html = renderToString(
      <MemoryRouter>
        <QuoteCard quote={FIXTURE_QUOTE} remove={() => {}} />
      </MemoryRouter>,
    );
    expect(html).toContain("h-8 w-8 sm:h-6 sm:w-6");
    expect(html).toContain('aria-label="Remove AAPL from watchlist"');
  });

  it("price chart renders the desktop 800-unit viewBox by default", () => {
    const html = renderToString(<PriceChart bars={FIXTURE_BARS} positive />);
    // node has no matchMedia, so the server render uses desktop geometry;
    // phones switch to the compact 400-unit geometry at runtime.
    expect(html).toContain('viewBox="0 0 800 340"');
    expect(html).toContain("polyline");
    expect(html).toContain('aria-label="Price chart, 4 points"');
  });

  it("price chart shows an honest empty state for short data", () => {
    const html = renderToString(<PriceChart bars={FIXTURE_BARS.slice(0, 1)} />);
    expect(html).toContain("Not enough data to chart this range.");
  });
});
