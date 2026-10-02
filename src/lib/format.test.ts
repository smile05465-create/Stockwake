import { describe, expect, it } from "vitest";
import {
  formatChange,
  formatCompact,
  formatDate,
  formatPercent,
  formatPrice,
  formatVolume,
} from "./format";

describe("formatPrice", () => {
  it("formats normal prices with 2 decimals", () => {
    expect(formatPrice(330.32)).toBe("330.32");
    expect(formatPrice(7666.45)).toBe("7,666.45");
  });

  it("uses 4 decimals for sub-dollar prices", () => {
    expect(formatPrice(0.0005)).toBe("0.0005");
    expect(formatPrice(0.12)).toBe("0.1200");
  });

  it("handles null/undefined/NaN as em dash", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
    expect(formatPrice(Number.NaN)).toBe("—");
  });

  it("formats negative prices", () => {
    expect(formatPrice(-12.5)).toBe("-12.50");
  });
});

describe("formatPercent", () => {
  it("signs positive and negative values", () => {
    expect(formatPercent(0.35)).toBe("+0.35%");
    expect(formatPercent(-0.81)).toBe("-0.81%");
    expect(formatPercent(0)).toBe("0.00%"); // neutral: no sign for flat
  });

  it("supports custom digits", () => {
    expect(formatPercent(1.5, 1)).toBe("+1.5%");
  });

  it("handles null", () => {
    expect(formatPercent(null)).toBe("—");
  });
});

describe("formatChange", () => {
  it("signs changes", () => {
    expect(formatChange(1.14)).toBe("+1.14");
    expect(formatChange(-2.7)).toBe("-2.70");
    expect(formatChange(0)).toBe("0.00"); // neutral: no sign for flat
  });
});

describe("formatCompact", () => {
  it("abbreviates large magnitudes", () => {
    expect(formatCompact(4_820_749_541_266)).toBe("4.82T");
    expect(formatCompact(466_823_000_000)).toBe("466.82B");
    expect(formatCompact(36_306_346)).toBe("36.3M");
    expect(formatCompact(221_700)).toBe("221.7K");
    expect(formatCompact(999)).toBe("999");
  });

  it("handles null", () => {
    expect(formatCompact(null)).toBe("—");
  });
});

describe("formatVolume", () => {
  it("groups digits", () => {
    expect(formatVolume(36_306_346.55)).toBe("36,306,347");
    expect(formatVolume(0)).toBe("0");
  });
});

describe("formatDate", () => {
  it("formats ISO dates", () => {
    expect(formatDate("2026-10-01")).toBe("Oct 1, 2026");
  });

  it("passes through garbage", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
    expect(formatDate(null)).toBe("—");
  });
});
