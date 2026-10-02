/** Public landing page: hero, live index pulse, features, CTA. */

import { Link } from "react-router-dom";
import { fetchCnbcQuotes } from "../lib/api";
import type { CnbcQuote } from "../lib/api";
import { useAsync } from "../hooks/useAsync";
import { formatPercent, formatPrice } from "../lib/format";
import type { ReactNode } from "react";

const INDICES = [".SPX", ".DJI", "IXIC", ".VIX"];

const FEATURES: Array<{ title: string; body: ReactNode; icon: string }> = [
  {
    title: "Wake up to the tape",
    body: "Indices, futures-style pre/post reads and the VIX — the market pulse in one glance before you pour the coffee.",
    icon: "◮",
  },
  {
    title: "Charts that answer questions",
    body: "Interactive price history from 1 month to 5 years with hover readouts for OHLC and volume. No clutter, no paywall.",
    icon: "◰",
  },
  {
    title: "Movers before they trend",
    body: "Live gainers, losers and most-active lists screened across NASDAQ and NYSE so you see what’s actually moving.",
    icon: "⇗",
  },
  {
    title: "A watchlist that sticks",
    body: "Pin the tickers you care about — it’s saved locally in your browser and ready when you come back.",
    icon: "⌖",
  },
  {
    title: "Search anything",
    body: "Type a ticker or company name and jump straight to quotes, stats, charts and related headlines.",
    icon: "⌕",
  },
  {
    title: "Headlines with the numbers",
    body: "Market news and per-symbol headlines sit next to the data, so context is always one scroll away.",
    icon: "≔",
  },
];

function IndexPulse() {
  const { data, error, loading } = useAsync<CnbcQuote[]>(
    () => fetchCnbcQuotes(INDICES),
    [],
  );

  if (error) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {INDICES.map((s) => (
          <div key={s} className="card p-3 text-center text-xs text-slate-500 num">
            {s} unavailable
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {(data ?? INDICES.map(() => null)).map((q, i) => {
        const symbol = q?.symbol ?? INDICES[i];
        if (!q) {
          return (
            <div key={symbol} className="card p-3 animate-pulse">
              <div className="h-3 w-14 bg-ink-700 rounded" />
              <div className="h-5 w-20 bg-ink-700 rounded mt-2" />
            </div>
          );
        }
        const up = q.changePct > 0;
        const flat = q.changePct === 0;
        return (
          <Link
            key={symbol}
            to={`/symbol/${encodeURIComponent(symbol)}`}
            className="card card-hover p-3 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-400">{q.name}</span>
              {loading && <span className="text-[10px] text-flare-400">•</span>}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="num text-lg font-semibold text-slate-100">
                {formatPrice(q.price)}
              </span>
              <span
                className={`num text-xs ${
                  flat ? "text-slate-400" : up ? "text-up" : "text-down"
                }`}
              >
                {formatPercent(q.changePct)}
              </span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

export default function Landing() {
  return (
    <div className="glow-dawn">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 sm:pt-24 pb-12">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 text-xs font-medium tracking-widest uppercase text-flare-400 border border-flare-500/30 rounded-full px-3 py-1 bg-flare-500/5">
            <span className="h-1.5 w-1.5 rounded-full bg-up animate-pulse" />
            Market intelligence, pre-bell
          </p>
          <h1 className="mt-5 text-4xl sm:text-6xl font-semibold tracking-tight text-slate-50 leading-[1.05]">
            The market wakes up.
            <br />
            <span className="text-flare-400">So should your data.</span>
          </h1>
          <p className="mt-5 text-lg text-slate-400 max-w-xl leading-relaxed">
            Stockwake brings live quotes, clean charts, movers and headlines together in one
            focused terminal — free, fast and without an account.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/markets"
              className="rounded-xl bg-flare-500 hover:bg-flare-400 text-ink-950 font-semibold px-6 py-3 transition-colors"
            >
              Open the dashboard
            </Link>
            <Link
              to="/watchlist"
              className="rounded-xl border border-ink-600 hover:border-flare-500/60 text-slate-200 px-6 py-3 font-medium transition-colors"
            >
              Build a watchlist
            </Link>
          </div>
        </div>
      </section>

      {/* Live index pulse */}
      <section className="mx-auto max-w-6xl px-4 pb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium tracking-wide uppercase text-slate-500">
            Index pulse
          </h2>
          <span className="text-xs text-slate-600">live via public feeds</span>
        </div>
        <IndexPulse />
      </section>

      {/* Features */}
      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl sm:text-3xl font-semibold text-slate-100 tracking-tight">
          Everything a pre-market routine needs
        </h2>
        <p className="mt-2 text-slate-400 max-w-2xl">
          One screen for the pulse, the proof and the plot — built for speed on both desktop and
          phone.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <article key={f.title} className="card card-hover p-5">
              <div className="text-flare-400 text-xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mt-3 font-semibold text-slate-100">{f.title}</h3>
              <p className="mt-1.5 text-sm text-slate-400 leading-relaxed">{f.body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        <div className="card p-8 sm:p-10 text-center relative overflow-hidden">
          <div
            aria-hidden
            className="absolute inset-0 opacity-60"
            style={{
              background:
                "radial-gradient(600px 200px at 50% 0%, rgba(255,159,28,0.14), transparent 70%)",
            }}
          />
          <h2 className="relative text-2xl sm:text-3xl font-semibold text-slate-50 tracking-tight">
            Check the tape before the noise does
          </h2>
          <p className="relative mt-3 text-slate-400 max-w-lg mx-auto">
            Jump straight into the dashboard — indices, movers, news and your watchlist, no sign-up
            required.
          </p>
          <div className="relative mt-6">
            <Link
              to="/markets"
              className="inline-block rounded-xl bg-flare-500 hover:bg-flare-400 text-ink-950 font-semibold px-7 py-3 transition-colors"
            >
              Launch Stockwake
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
