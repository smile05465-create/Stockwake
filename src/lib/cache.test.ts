import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TtlCache } from "./cache";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TtlCache", () => {
  it("returns stored values before expiry", () => {
    const cache = new TtlCache(1000);
    cache.set("k", 42);
    expect(cache.get<number>("k")).toBe(42);
  });

  it("expires values after the TTL", () => {
    const cache = new TtlCache(1000);
    cache.set("k", 42);
    vi.advanceTimersByTime(1001);
    expect(cache.get<number>("k")).toBeUndefined();
  });

  it("supports per-entry TTL overrides", () => {
    const cache = new TtlCache(60_000);
    cache.set("short", "v", 500);
    vi.advanceTimersByTime(501);
    expect(cache.get("short")).toBeUndefined();
  });

  it("wrap() caches successful results", async () => {
    const cache = new TtlCache(10_000);
    const producer = vi.fn().mockResolvedValue("value");
    await expect(cache.wrap("k", 10_000, producer)).resolves.toBe("value");
    await expect(cache.wrap("k", 10_000, producer)).resolves.toBe("value");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("wrap() dedupes concurrent callers into one producer call", async () => {
    const cache = new TtlCache(10_000);
    let resolve!: (v: string) => void;
    const producer = vi.fn(
      () => new Promise<string>((r) => {
        resolve = r;
      }),
    );
    const p1 = cache.wrap("k", 10_000, producer);
    const p2 = cache.wrap("k", 10_000, producer);
    resolve("shared");
    await expect(p1).resolves.toBe("shared");
    await expect(p2).resolves.toBe("shared");
    expect(producer).toHaveBeenCalledTimes(1);
  });

  it("wrap() does not cache failures", async () => {
    const cache = new TtlCache(10_000);
    const producer = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce("ok");
    await expect(cache.wrap("k", 10_000, producer)).rejects.toThrow("boom");
    await expect(cache.wrap("k", 10_000, producer)).resolves.toBe("ok");
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("wrap() retries after TTL expiry", async () => {
    const cache = new TtlCache(1000);
    const producer = vi.fn().mockResolvedValue("v");
    await cache.wrap("k", 1000, producer);
    vi.advanceTimersByTime(1001);
    await cache.wrap("k", 1000, producer);
    expect(producer).toHaveBeenCalledTimes(2);
  });

  it("clear() empties entries", () => {
    const cache = new TtlCache();
    cache.set("a", 1);
    expect(cache.size).toBe(1);
    cache.clear();
    expect(cache.size).toBe(0);
  });
});
