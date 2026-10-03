import { describe, expect, it } from "vitest";
import { fmtN, fmtR } from "./format";

describe("fmtN", () => {
  it("shows numbers under 1,000 whole", () => {
    expect(fmtN(0)).toBe("0");
    expect(fmtN(7)).toBe("7");
    expect(fmtN(12.7)).toBe("13");
    expect(fmtN(999)).toBe("999");
    expect(fmtN(-999)).toBe("-999");
  });

  it("shortens thousands to K, with one decimal under 100K", () => {
    expect(fmtN(1000)).toBe("1K");
    expect(fmtN(1500)).toBe("1.5K");
    expect(fmtN(12345)).toBe("12.3K");
    expect(fmtN(123456)).toBe("123K");
    expect(fmtN(-1500)).toBe("-1.5K");
  });

  it("picks the unit after rounding, so nothing shows as 1000K", () => {
    expect(fmtN(999.6)).toBe("1K");
    expect(fmtN(999999)).toBe("1.00M");
  });

  it("shows millions with two decimals, and billions as B", () => {
    expect(fmtN(1340700)).toBe("1.34M");
    expect(fmtN(2000000)).toBe("2.00M");
    expect(fmtN(2.5e9)).toBe("2.5B");
    expect(fmtN(1.5e12)).toBe("1500B");
  });
});

describe("fmtR", () => {
  it("shows a dash for a missing figure", () => {
    expect(fmtR(null)).toBe("—");
    expect(fmtR(0)).toBe("0");
    expect(fmtR(180000)).toBe("180K");
  });
});
