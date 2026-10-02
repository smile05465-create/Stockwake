/**
 * Render smoke test: server-renders every route through the real App
 * (router, layout, pages) to catch invalid-hook calls, bad imports, and
 * runtime crashes in initial render. Effects don't run in SSR, so no
 * network requests are made.
 */

import { describe, expect, it } from "vitest";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import App from "./App";

function renderAt(path: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routes render", () => {
  it("renders the landing page", () => {
    const html = renderAt("/");
    expect(html).toContain("Stock");
    expect(html).toContain("wake");
    expect(html).toContain("dashboard");
  });

  it("renders the markets dashboard shell", () => {
    const html = renderAt("/markets");
    expect(html).toContain("Markets");
    expect(html).toContain("Market movers");
    expect(html).toContain("Gainers");
    expect(html).toContain("watchlist");
  });

  it("renders the watchlist page", () => {
    const html = renderAt("/watchlist");
    expect(html).toContain("Watchlist");
    expect(html).toContain("Add symbol");
  });

  it("renders a symbol detail page", () => {
    const html = renderAt("/symbol/AAPL");
    expect(html).toContain("AAPL");
    expect(html).toContain("Key statistics");
    expect(html).toContain("Price history");
    expect(html).toContain("Previous close");
  });

  it("renders 404 for unknown routes", () => {
    const html = renderAt("/definitely-not-a-route");
    expect(html).toContain("404");
  });

  it("renders shared nav and search on every page", () => {
    const html = renderAt("/markets");
    expect(html).toContain('aria-label="Search symbols"');
    expect(html).toContain("Markets");
    expect(html).toContain("Watchlist");
    expect(html).toContain("not investment advice");
  });

  it("renders the mobile-only nav row so phones can reach every page", () => {
    const html = renderAt("/symbol/AAPL");
    // Header nav is hidden below `sm`; the mobile row must always render.
    expect(html).toContain("sm:hidden");
    expect(html.match(/href="\/watchlist"/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html.match(/href="\/markets"/g)?.length).toBeGreaterThanOrEqual(1);
  });
});
