/** News headline list. */

import type { NewsItem } from "../lib/types";

interface Props {
  news: NewsItem[] | null;
  loading: boolean;
  error: Error | null;
  title?: string;
  emptyText?: string;
}

function timeAgo(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function NewsList({
  news,
  loading,
  error,
  title = "Latest headlines",
  emptyText = "No headlines right now.",
}: Props) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="text-base font-semibold text-slate-100 mb-3">{title}</h2>

      {error && <p className="text-sm text-down py-4 text-center">Couldn’t load news.</p>}
      {loading && !news && (
        <div className="py-8 text-center text-sm text-slate-500">Loading headlines…</div>
      )}

      {news && news.length === 0 && <p className="text-sm text-slate-500 py-4">{emptyText}</p>}

      {news && news.length > 0 && (
        <ul className="divide-y divide-ink-800">
          {news.map((item, i) => (
            <li key={`${item.url}-${i}`}>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group block py-3"
              >
                <p className="text-sm text-slate-300 group-hover:text-flare-300 transition-colors leading-snug">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-slate-500 flex gap-2">
                  <span className="truncate max-w-[160px]">{item.source}</span>
                  {item.publishedAt && (
                    <>
                      <span aria-hidden>·</span>
                      <span>{timeAgo(item.publishedAt)}</span>
                    </>
                  )}
                </p>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
