import { useEffect, useRef } from "react";

/**
 * Refresh data on a timer, but only while the tab is visible and only after a
 * successful load — a dashboard that quietly retries a dead feed wastes the
 * free quota that keeps it free.
 */
export function useAutoRefresh(
  reload: () => void,
  { intervalMs = 60_000, enabled = true }: { intervalMs?: number; enabled?: boolean } = {},
) {
  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!enabled) return;
    const tick = () => {
      if (document.visibilityState === "visible") reloadRef.current();
    };
    const id = window.setInterval(tick, intervalMs);
    const onVisible = () => {
      if (document.visibilityState === "visible") reloadRef.current();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [intervalMs, enabled]);
}
