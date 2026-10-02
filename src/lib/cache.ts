/**
 * Tiny TTL cache with single-flight dedupe.
 *
 * Keeps the client from hammering the free market-data endpoints:
 * identical in-flight requests share one promise, and successful
 * responses are served from memory until they expire.
 */

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache {
  private store = new Map<string, Entry<unknown>>();
  private inflight = new Map<string, Promise<unknown>>();

  constructor(private defaultTtlMs: number = 60_000) {}

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlMs: number = this.defaultTtlMs): void {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  /** Deduplicated async read: concurrent callers share one producer. */
  async wrap<T>(key: string, ttlMs: number, producer: () => Promise<T>): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== undefined) return cached;

    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const promise = producer()
      .then((value) => {
        this.set(key, value, ttlMs);
        return value;
      })
      .finally(() => {
        this.inflight.delete(key);
      });

    this.inflight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.store.clear();
    this.inflight.clear();
  }

  get size(): number {
    return this.store.size;
  }
}

/** Shared app-wide cache instance. */
export const marketCache = new TtlCache(45_000);
