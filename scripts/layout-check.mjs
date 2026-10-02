/**
 * Real rendered-layout verification for Stockwake (Playwright/Chromium).
 *
 * Renders the running preview in a headless browser at phone / tablet /
 * desktop widths and asserts, from real geometry:
 *   - no horizontal page scrolling and nothing painted past the viewport
 *   - movers render as compact cards below lg (table hidden), as the
 *     original table at lg+, with every data field visible on phones
 *   - watchlist grids collapse to one column on phones
 *   - search bar, nav and tab controls fit and are tappable
 *   - no visible text overflows its box (scrollWidth > clientWidth)
 *
 * Usage:
 *   node scripts/layout-check.mjs [widths]   # default: 360,390,430,768,1280
 *   LAYOUT_BASE=http://host:port node scripts/layout-check.mjs
 */

import { chromium } from "playwright";

const BASE = process.env.LAYOUT_BASE ?? "http://localhost:5173";
const widths = (process.argv[2] ?? "360,390,430,768,1280")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

let pass = 0;
let fail = 0;

function check(cond, label, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  PASS  ${label}`);
  } else {
    fail += 1;
    console.log(`  FAIL  ${label}${extra ? ` — ${extra}` : ""}`);
  }
}

/** Page-level: no horizontal scroll + no visible element painted beyond the viewport. */
async function globalScan(page) {
  const m = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    docScroll: document.documentElement.scrollWidth,
    bodyScroll: document.body.scrollWidth,
  }));
  check(
    m.docScroll <= m.innerWidth + 1 && m.bodyScroll <= m.innerWidth + 1,
    `no horizontal page scroll (doc ${m.docScroll}px / body ${m.bodyScroll}px ≤ viewport ${m.innerWidth}px)`,
  );

  // Rect-based: anything visibly extending past the viewport (except inside an
  // intentional horizontal scroller) is either cut off or causes page scroll.
  const offenders = await page.evaluate(() => {
    const vw = window.innerWidth;
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1 || r.left < -1) {
        let p = el.parentElement;
        let contained = false;
        while (p) {
          const o = getComputedStyle(p).overflowX;
          if (o === "auto" || o === "scroll") {
            contained = true;
            break;
          }
          p = p.parentElement;
        }
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.getAttribute("class") ?? "").slice(0, 70),
          left: Math.round(r.left),
          right: Math.round(r.right),
          contained,
        });
      }
    }
    return out;
  });
  const visible = offenders.filter((o) => !o.contained);
  check(
    visible.length === 0,
    "no visible element painted beyond the viewport",
    visible
      .slice(0, 6)
      .map((o) => `${o.tag}[${o.left}..${o.right}]{${o.cls}}`)
      .join(" | "),
  );
  const contained = offenders.filter((o) => o.contained);
  if (contained.length) {
    console.log(`  note  contained horizontal scroller(s): ${contained.map((o) => `${o.tag}{${o.cls}}`).join(", ")}`);
  }

  // Text-overflow scan: block boxes whose content is wider than the box while
  // overflow is visible (classic flex/min-width bugs paint outside the box).
  const textBleed = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      if (el === document.body || el === document.documentElement) continue;
      if (el.tagName.toLowerCase() === "svg" || el.closest("svg")) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.overflowX !== "visible") continue;
      if (el.clientWidth === 0) continue;
      if (el.scrollWidth > el.clientWidth + 1) {
        out.push({
          tag: el.tagName.toLowerCase(),
          cls: String(el.getAttribute("class") ?? "").slice(0, 60),
          scroll: el.scrollWidth,
          client: el.clientWidth,
        });
      }
    }
    return out;
  });
  check(
    textBleed.length === 0,
    "no visible text overflows its box",
    textBleed
      .slice(0, 6)
      .map((o) => `${o.tag}{${o.cls}} ${o.scroll}>${o.client}`)
      .join(" | "),
  );
}

/** Header chrome: search fits, correct nav row for the tier. */
async function checkChrome(page, width) {
  const input = page.locator('input[aria-label="Search symbols"]');
  const box = await input.boundingBox();
  check(
    !!box && box.x >= 0 && box.x + box.width <= width + 1 && box.width >= 100,
    `search bar fits (${width}px)`,
    JSON.stringify(box),
  );

  const phone = width < 640;
  const mobileNav = page.locator("nav.sm\\:hidden");
  const desktopNav = page.locator("nav.hidden.sm\\:flex");
  check((await mobileNav.isVisible()) === phone, `mobile nav row ${phone ? "visible" : "hidden"} at ${width}px`);
  check((await desktopNav.isVisible()) === !phone, `desktop nav row ${!phone ? "visible" : "hidden"} at ${width}px`);
  if (phone) {
    const navBox = await mobileNav.boundingBox();
    check(
      !!navBox && navBox.x >= 0 && navBox.x + navBox.width <= width + 1,
      "mobile nav fits",
      JSON.stringify(navBox),
    );
  }
}

/** Markets: movers cards vs table per tier, all fields, tab tap targets. */
async function checkMovers(page, width) {
  const heading = page.getByRole("heading", { name: "Market movers" });
  await heading.waitFor({ state: "visible", timeout: 20_000 });
  const section = page.locator("section", { has: heading });
  const cards = section.locator("ul.lg\\:hidden");
  const table = section.locator("table");

  const firstCard = cards.locator("li a").first();
  let loaded = true;
  try {
    await firstCard.waitFor({ state: "attached", timeout: 20_000 });
  } catch {
    loaded = false;
  }
  check(loaded, "movers data rendered");
  if (!loaded) return;

  const belowLg = width < 1024;
  check((await cards.isVisible()) === belowLg, `movers cards ${belowLg ? "visible" : "hidden"} at ${width}px`);
  check((await table.isVisible()) === !belowLg, `movers table ${!belowLg ? "visible" : "hidden"} at ${width}px`);

  // Tabs: fully visible, in-bounds, tappable.
  const tabs = section.getByRole("tab");
  const tabCount = await tabs.count();
  check(tabCount === 3, `3 mover tabs rendered (got ${tabCount})`);
  for (let i = 0; i < tabCount; i++) {
    const b = await tabs.nth(i).boundingBox();
    const minH = width < 1024 ? 28 : 0; // touch tiers need a comfortable target;
    check(
      // lg+ keeps the original compact desktop sizing (mouse-driven).
      !!b && b.x >= 0 && b.x + b.width <= width + 1 && b.height >= minH,
      `tab ${i + 1} in-bounds${minH ? ` & ≥${minH}px tall` : ""}`,
      JSON.stringify(b),
    );
  }

  if (belowLg) {
    const card = await firstCard;
    const text = (await card.innerText()).replace(/\s+/g, " ");
    check(/[A-Z]{1,6}/.test(text), "card shows Symbol", text.slice(0, 90));
    check(text.trim().length > 6, "card shows Company Name + data", text.slice(0, 90));
    check(/\d[\d,.]*\s*%/.test(text), "card shows Change (%)", text.slice(0, 90));
    check(/\bVol\b/.test(text), "card shows Volume", text.slice(0, 90));
    check(/\bCap\b/.test(text), "card shows Market Cap", text.slice(0, 90));
    check(/NASDAQ|NYSE|AMEX/i.test(text), "card shows Exchange", text.slice(0, 120));

    // The Vol·Cap·Exchange meta line must not be ellipsis-truncated on phones.
    const meta = await card.evaluate((a) => {
      const d = [...a.querySelectorAll("div")].find((x) => String(x.className).includes("11px"));
      return d ? { scroll: d.scrollWidth, client: d.clientWidth } : null;
    });
    if (meta) {
      check(
        meta.scroll <= meta.client + 1,
        "meta line (Vol·Cap·Exchange) fully visible, not truncated",
        JSON.stringify(meta),
      );
    }
    // The card row itself must fit the viewport.
    const cb = await card.boundingBox();
    check(
      !!cb && cb.x >= 0 && cb.x + cb.width <= width + 1,
      "mover card fits viewport width",
      JSON.stringify(cb),
    );
  } else {
    const ths = (await table.locator("th").allInnerTexts()).map((t) => t.trim());
    check(
      ["Symbol", "Price", "Change", "Volume", "Mkt cap"].every((h) => ths.includes(h)),
      "desktop table columns intact",
      ths.join(","),
    );
    const scroll = await table.evaluate((t) => {
      const c = t.parentElement;
      return { scroll: c.scrollWidth, client: c.clientWidth };
    });
    check(
      scroll.scroll <= scroll.client + 1,
      "desktop table has no internal horizontal scroll",
      JSON.stringify(scroll),
    );
  }
}

/** Watchlist: column count per tier + cards fit. */
async function checkWatchlist(page, width) {
  await page.getByRole("heading", { name: "Watchlist", exact: true }).waitFor({ state: "visible", timeout: 15_000 });
  const cols = await page.evaluate(() => {
    const el = [...document.querySelectorAll("main div")].find(
      (d) => typeof d.className === "string" && d.className.includes("sm:grid-cols-2"),
    );
    if (!el) return 0;
    const tpl = getComputedStyle(el).gridTemplateColumns;
    return (tpl.match(/minmax|\d+(\.\d+)?px/g) ?? []).length;
  });
  const expected = width < 640 ? 1 : width < 1024 ? 2 : 3;
  check(cols === expected, `watchlist grid: ${cols} column(s) at ${width}px (expected ${expected})`);
}

/** Symbol page: chart, range pills, stats all inside the viewport. */
async function checkSymbolPage(page, width) {
  const chart = page.locator('svg[role="img"]');
  await chart.waitFor({ state: "visible", timeout: 25_000 });
  const cb = await chart.boundingBox();
  check(
    !!cb && cb.x >= 0 && cb.x + cb.width <= width + 1 && cb.height >= 150,
    `chart renders inside viewport with usable height (${Math.round(cb?.height ?? 0)}px)`,
    JSON.stringify(cb),
  );

  const ranges = page.getByRole("button", { name: /^(1D|1W|1M|3M|1Y|5Y)$/ });
  const rangeCount = await ranges.count();
  check(rangeCount === 6, `6 range pills rendered (got ${rangeCount})`);
  const minH = width < 1024 ? 28 : 0; // touch tiers need a comfortable target;
  for (let i = 0; i < rangeCount; i++) {
    const b = await ranges.nth(i).boundingBox();
    if (!b) continue;
    check(
      // lg+ keeps the original compact desktop sizing (mouse-driven).
      b.x >= 0 && b.x + b.width <= width + 1 && b.height >= minH,
      `range pill ${i + 1} in-bounds${minH ? ` & ≥${minH}px tall` : ""}`,
      JSON.stringify(b),
    );
  }
  // The watch toggle must also stay in-bounds.
  const watch = page.locator('button[aria-pressed]');
  const watchBox = await watch.first().boundingBox();
  check(
    !!watchBox && watchBox.x >= 0 && watchBox.x + watchBox.width <= width + 1,
    "watch toggle in-bounds",
    JSON.stringify(watchBox),
  );
  await page.getByRole("heading", { name: "Key statistics" }).waitFor({ state: "visible", timeout: 10_000 });
}

const PAGES = [
  { path: "/", name: "landing", extra: null },
  { path: "/#/markets", name: "markets", extra: checkMovers },
  { path: "/#/watchlist", name: "watchlist", extra: checkWatchlist },
  { path: "/#/symbol/AAPL", name: "symbol", extra: checkSymbolPage },
];

const browser = await chromium.launch();
console.log(`layout-check against ${BASE} at width(s): ${widths.join(", ")}\n`);

for (const width of widths) {
  console.log(`=== ${width}px ===`);
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 1,
    hasTouch: width < 1024,
    isMobile: width < 1024,
  });
  const page = await context.newPage();
  const pageErrors = [];
  page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 140)));

  for (const p of PAGES) {
    console.log(`-- ${p.name} ${p.path}`);
    await page.goto(`${BASE}${p.path}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await checkChrome(page, width);
    if (p.extra) await p.extra(page, width);
    await globalScan(page);
  }

  check(pageErrors.length === 0, "no runtime page errors", pageErrors.join(" | "));
  await context.close();
  console.log("");
}

await browser.close();
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
