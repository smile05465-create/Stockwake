/** App shell: sticky header with nav + symbol search, footer below. */

import { Link, NavLink, Outlet } from "react-router-dom";
import SearchBox from "./SearchBox";

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5 group">
      <span aria-hidden className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-ink-800 border border-ink-600 overflow-hidden">
        <svg viewBox="0 0 64 64" className="h-6 w-6">
          <path
            d="M10 44 L24 30 L33 38 L54 16"
            fill="none"
            stroke="var(--color-flare-400)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="54" cy="16" r="6" fill="var(--color-up)" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight text-slate-100">
        Stock<span className="text-flare-400">wake</span>
      </span>
    </Link>
  );
}

const navLinks = [
  { to: "/markets", label: "Markets" },
  { to: "/watchlist", label: "Watchlist" },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col overflow-x-clip">
      <header className="sticky top-0 z-40 border-b border-ink-700/70 glass">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center gap-4">
          <Logo />
          <nav className="hidden sm:flex items-center gap-1 ml-2">
            {navLinks.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                className={({ isActive }) =>
                  `px-3 py-1.5 rounded-md text-sm transition-colors ${
                    isActive
                      ? "text-flare-300 bg-ink-800"
                      : "text-slate-400 hover:text-slate-200 hover:bg-ink-850"
                  }`
                }
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1" />
          <SearchBox />
        </div>

        {/* Mobile nav row — phones get the same destinations as desktop. */}
        <nav className="sm:hidden border-t border-ink-700/70 px-4 py-1.5 flex items-center gap-1">
          {navLinks.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm transition-colors ${
                  isActive
                    ? "text-flare-300 bg-ink-800"
                    : "text-slate-400 hover:text-slate-200 hover:bg-ink-850"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-ink-700/70 mt-16">
        <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <p>
            <span className="text-slate-400 font-medium">Stockwake</span> — market
            intelligence before the bell.
          </p>
          <p className="text-xs">
            Data from public market feeds. For information only — not investment advice.
          </p>
        </div>
      </footer>
    </div>
  );
}
