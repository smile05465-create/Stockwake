/** Small async data hook with manual reload support. */

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  /** First load only — a background refresh keeps `loading` false. */
  loading: boolean;
  /** True while a reload runs on top of existing data. */
  refreshing: boolean;
  /** When the current data arrived. */
  updatedAt: number | null;
  reload: () => void;
}

/**
 * Run an async loader whenever `deps` change (or on `reload()`).
 * Stale responses are discarded, so fast navigation stays consistent, and a
 * reload never blanks the screen — the old data stays until the new arrives.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);
  const loaderRef = useRef(loader);
  const hasData = useRef(false);
  loaderRef.current = loader;

  useEffect(() => {
    let alive = true;
    if (hasData.current) setRefreshing(true);
    else setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((value) => {
        if (!alive) return;
        setData(value);
        hasData.current = true;
        setUpdatedAt(Date.now());
        setLoading(false);
        setRefreshing(false);
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, error, loading, refreshing, updatedAt, reload };
}
