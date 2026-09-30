import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, shownRent, toDays, toSettings } from "./settings";

describe("toDays", () => {
  it("takes whole numbers of days from 0 to 365, typed or saved", () => {
    expect(toDays(0)).toBe(0);
    expect(toDays("90")).toBe(90);
    expect(toDays(" 365 ")).toBe(365);
    expect(toDays(366)).toBeNull();
    expect(toDays(-1)).toBeNull();
    expect(toDays(7.5)).toBeNull();
    expect(toDays("")).toBeNull();
    expect(toDays("abc")).toBeNull();
    expect(toDays(null)).toBeNull();
  });
});

describe("toSettings", () => {
  it("gives the defaults for nothing saved or unreadable values", () => {
    expect(toSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(toSettings("text")).toEqual(DEFAULT_SETTINGS);
    expect(toSettings({ leadDays: "x", warningDays: 1000, includeVat: "yes" })).toEqual(DEFAULT_SETTINGS);
  });

  it("keeps valid saved values", () => {
    expect(
      toSettings({ leadDays: 60, warningDays: 14, includeVat: true, rentFlagPercent: 40, pinColors: "rent" }),
    ).toEqual({
      ...DEFAULT_SETTINGS,
      leadDays: 60,
      warningDays: 14,
      includeVat: true,
      rentFlagPercent: 40,
      pinColors: "rent",
    });
  });

  it("fills in settings saved by an earlier version", () => {
    expect(toSettings({ leadDays: 60, warningDays: 14, includeVat: true })).toEqual({
      ...DEFAULT_SETTINGS,
      leadDays: 60,
      warningDays: 14,
      includeVat: true,
    });
    expect(toSettings({ rentFlagPercent: 501, pinColors: "size" })).toEqual(DEFAULT_SETTINGS);
  });
});

describe("shownRent", () => {
  it("adds 15% VAT only when that setting is on", () => {
    expect(shownRent(100_000, DEFAULT_SETTINGS)).toBe(100_000);
    expect(shownRent(100_000, { ...DEFAULT_SETTINGS, includeVat: true })).toBeCloseTo(115_000);
    expect(shownRent(null, { ...DEFAULT_SETTINGS, includeVat: true })).toBeNull();
  });
});
