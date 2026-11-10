/**
 * Functional smoke test for Stockwake (Playwright/Chromium).
 *
 * The unit tests cover parsing; this covers the thing a person actually does:
 * land on the page, read the market, search a ticker, open it, add it to the
 * watchlist, and find it there after a reload.
 *
 * Third-party feeds can be slow or blocked from a test machine, so data
 * assertions degrade to a warning instead of a false pass: a step that could
 * not load data is reported as SKIP, never as PASS.
 *
 * Usage:
 *   node scripts/smoke-check.mjs
 *   SMOKE_BASE=http://127.0.0.1:4190 node scripts/smoke-check.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE ?? "http://localhost:4173";

let pass = 0;
let fail = 0;
let skip = 0;

function ok(label) {
  pass += 1;
  console.log(`  PASS  ${label}`);
}
function bad(label, extra = "") {
  fail += 1;
  console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
}
function note(label) {
  skip += 1;
  console.log(`  SKIP  ${label}`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error" && !/favicon|manifest/i.test(m.text())) errors.push(m.text());
});

try {
  /* ---------- landing ---------- */
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 45_000 });
  console.log("-- landing");
  (await page.locator("h1").count()) > 0 ? ok("headline renders") : bad("headline renders");

  const indexCards = await page.locator("a[href*='#/symbol'], [data-index]").count();
  const pulse = await page.locator("text=/S&P 500/i").count();
  pulse > 0 ? ok("index pulse present") : note("index pulse not loaded (feed unavailable)");

  const ctaCount = await page.getByRole("link", { name: /dashboard/i }).count();
  ctaCount > 0 ? ok("dashboard CTA present") : bad("dashboard CTA present");

  /* ---------- markets ---------- */
  await page.goto(`${BASE}/#/markets`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForTimeout(3_000);
  console.log("-- markets");
  (await page.getByRole("tab", { name: /gainers/i }).count()) > 0
    ? ok("movers tabs render")
    : bad("movers tabs render");

  const moverRows = await page.locator("ul li a[href*='#/symbol']").count();
  moverRows > 0 ? ok(`movers list has ${moverRows} rows`) : note("movers list empty (feed unavailable)");

  /* ---------- search (local index, must always work) ---------- */
  console.log("-- search");
  const box = page.locator('input[placeholder*="Search"]').first();
  await box.click();
  await box.type("apple", { delay: 40 });
  await page.waitForTimeout(900);
  const options = page.locator('[role="option"]');
  const optCount = await options.count();
  optCount > 0 ? ok(`search returned ${optCount} suggestions`) : bad("search returned no suggestions");

  const firstText = optCount > 0 ? (await options.first().innerText()).replace(/\s+/g, " ") : "";
  /AAPL/i.test(firstText) ? ok("exact ticker ranks first for “apple”") : bad("exact ticker ranks first", firstText);

  if (optCount > 0) {
    await options.first().click();
    await page.waitForTimeout(3_500);
    /#\/symbol\/AAPL/.test(page.url()) ? ok("tapping a suggestion opens the symbol page") : bad("suggestion navigation", page.url());
  }

  /* ---------- symbol page ---------- */
  console.log("-- symbol page");
  const body = await page.locator("body").innerText();
  /AAPL/.test(body) ? ok("symbol page renders the ticker") : bad("symbol page renders the ticker");
  /\d+\.\d{2}/.test(body) ? ok("a price is shown") : note("no price (quote feed unavailable)");

  const watchBtn = page.locator("button", { hasText: /Add to Watchlist|Remove from Watchlist/ }).first();
  (await watchBtn.count()) > 0 ? ok("watchlist toggle present") : bad("watchlist toggle present");

  if ((await watchBtn.count()) > 0) {
    const label = await watchBtn.innerText();
    if (/Add to Watchlist/i.test(label)) await watchBtn.click();
    await page.waitForTimeout(500);
  }

  /* ---------- watchlist + persistence ---------- */
  console.log("-- watchlist");
  await page.goto(`${BASE}/#/watchlist`, { waitUntil: "networkidle", timeout: 45_000 });
  await page.waitForTimeout(3_000);
  const wl = await page.locator("body").innerText();
  /AAPL/.test(wl) ? ok("added symbol appears in the watchlist") : bad("added symbol appears in the watchlist");

  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(2_500);
  const afterReload = await page.locator("body").innerText();
  /AAPL/.test(afterReload) ? ok("watchlist survives a reload") : bad("watchlist survives a reload");

  /* ---------- runtime health ---------- */
  console.log("-- runtime");
  errors.length === 0 ? ok("no runtime page errors") : bad("no runtime page errors", errors.slice(0, 3).join(" | "));
} finally {
  await browser.close();
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed, ${skip} skipped`);
if (fail > 0) process.exitCode = 1;
