#!/usr/bin/env node
/**
 * Regenerate `public/tickers.json` — the local symbol index behind
 * Stockwake's search box.
 *
 * Source: the free Nasdaq trader symbol directory (no key, no account),
 * which lists every US-listed security on Nasdaq, NYSE, NYSE American and
 * Arca, including ETFs:
 *   https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt
 *   https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt
 *
 * Usage: node scripts/build-tickers.mjs
 * Re-run every few months (listings change slowly) and commit the result.
 */

import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SOURCES = [
  "https://www.nasdaqtrader.com/dynamic/symdir/nasdaqlisted.txt",
  "https://www.nasdaqtrader.com/dynamic/symdir/otherlisted.txt",
];

/** Trailing security-type wording that makes a name noisy in a search list. */
const NAME_NOISE = [
  /,?\s+each representing.*$/i,
  /\s+-\s+(Class [A-Z]|American Depositary|Ordinary Shar|Common Stock|Common Shar|Depositary Shar|Capital Stock|Warrant|Unit|Right|Preferred|Series [A-Z]|Notes|Subordinate|Debenture|Trust Preferred|Fixed[- ]to[- ]Floating).*$/i,
  /\s+(Class [A-Z]|American Depositary|Ordinary Shar|Common Stock|Common Shar|Depositary Shar|Capital Stock|Warrant|Unit|Right|Preferred|Series [A-Z]|Notes|Subordinate|Debenture|Trust Preferred|Fixed[- ]to[- ]Floating).*$/i,
  /\s+Common Stock$/i,
  /\s+New$/i,
];

function cleanName(raw) {
  let name = raw.replace(/\s+/g, " ").trim();
  for (const rule of NAME_NOISE) name = name.replace(rule, "").replace(/[\s,-]+$/, "");
  if (name.length > 70) name = `${name.slice(0, 67).replace(/[\s,-]+$/, "")}…`;
  return name || raw.trim();
}

const SYMBOL_RE = /^[A-Z0-9.-]{1,7}$/;

async function fetchPipeFile(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Stockwake symbol index build (open source dashboard)" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.text()).split(/\r?\n/);
}

const rows = new Map();

function add(symbol, name, isEtf) {
  const sym = (symbol ?? "").trim().toUpperCase();
  const clean = (name ?? "").trim();
  if (!sym || !clean || sym.startsWith("FILE CREATION")) return;
  if (!SYMBOL_RE.test(sym) || rows.has(sym)) return;
  rows.set(sym, [sym, cleanName(clean), isEtf === "Y" ? "e" : "s"]);
}

// nasdaqlisted.txt: Symbol|Security Name|Market Category|Test Issue|…|ETF|…
for (const line of (await fetchPipeFile(SOURCES[0])).slice(1)) {
  const f = line.split("|");
  if (f.length < 8 || f[3] === "Y") continue; // skip test issues
  add(f[0], f[1], f[6]);
}

// otherlisted.txt: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|…|Test Issue|…
for (const line of (await fetchPipeFile(SOURCES[1])).slice(1)) {
  const f = line.split("|");
  if (f.length < 8 || f[6] === "Y") continue;
  add(f[0], f[1], f[4]);
}

const payload = {
  v: 1,
  updated: new Date().toISOString().slice(0, 10),
  source: "nasdaqtrader.com/dynamic/symdir",
  rows: [...rows.keys()].sort().map((k) => rows.get(k)),
};

const outPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "public",
  "tickers.json",
);
await writeFile(outPath, JSON.stringify(payload));
console.log(`wrote ${payload.rows.length} symbols to ${outPath}`);
