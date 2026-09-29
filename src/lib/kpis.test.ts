import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Store } from "../types";
import { kpiStats, missing } from "./kpis";

const store = (id: number, patch: Partial<Store>): Store => ({
  id,
  name: `S${id}`,
  dsCode: "",
  city: "Riyadh",
  country: "KSA",
  contractDuration: "",
  startDate: "",
  endDate: "",
  size: null,
  rentSARAnnual: null,
  rentSARMonthly: null,
  rentSARsqm: null,
  lat: null,
  lng: null,
  ...patch,
});

describe("kpiStats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 28, 12));
  });
  afterEach(() => vi.useRealTimers());

  const stores = [
    store(1, { live: "Live", paid: "Paid", size: 100, rentSARAnnual: 120_000, endDate: "2026-11-01" }), // renew now
    store(2, { live: "Live", paid: "Not paid", size: 200, rentSARAnnual: 360_000, endDate: "2027-01-10" }), // soon
    store(3, { live: "Not live", size: 300, endDate: "2026-01-01" }), // expired, no rent
    store(4, { live: "", paid: "", rentSARAnnual: 60_000, endDate: "2029-01-01" }), // no area, ok
  ];
  const days = { leadDays: 75, warningDays: 30 };

  it("counts the stores by status and renewal", () => {
    const s = kpiStats(stores, days, false);
    expect(s).toMatchObject({ total: 4, live: 2, paid: 1, renewals: { now: 1, soon: 1, expired: 1 } });
  });

  it("adds up rent and area, and says what was left out", () => {
    const s = kpiStats(stores, days, false);
    expect(s).toMatchObject({ totalRent: 540_000, totalArea: 600, noRent: 1, noArea: 1 });
    expect(missing(s.noRent, "rent")).toBe("1 without rent");
    expect(missing(0, "area")).toBeUndefined();
  });

  it("works out rent per m² only from stores with both rent and area", () => {
    expect(kpiStats(stores, days, false).avgRent).toBe(480_000 / 300);
  });

  it("adds VAT when Settings say so", () => {
    const s = kpiStats(stores, days, true);
    expect(s.totalRent).toBeCloseTo(540_000 * 1.15);
    expect(s.avgRent).toBeCloseTo((480_000 * 1.15) / 300);
  });

  it("is all zeros with no stores", () => {
    expect(kpiStats([], days, false)).toMatchObject({ total: 0, totalRent: 0, avgRent: 0 });
  });
});
