/** 404 page with helpful exits. */

import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-24 text-center">
      <p className="num text-6xl font-semibold text-flare-400">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-slate-100">This ticker doesn’t trade</h1>
      <p className="mt-2 text-slate-500">
        The page you’re after isn’t here. Try the dashboard or your watchlist.
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Link
          to="/markets"
          className="rounded-xl bg-flare-500 hover:bg-flare-400 text-ink-950 font-semibold px-5 py-2.5 transition-colors"
        >
          Markets
        </Link>
        <Link
          to="/"
          className="rounded-xl border border-ink-600 hover:border-flare-500/60 px-5 py-2.5 text-slate-200 transition-colors"
        >
          Home
        </Link>
      </div>
    </div>
  );
}
