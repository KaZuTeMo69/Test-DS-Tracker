import { describe, expect, it } from "vitest";
import { Store } from "../types";
import { rentBenchmarks } from "./rentStats";

const store = (id: number, city: string, rentSARsqm: number | null, rentSARAnnual: number | null = null): Store => ({
  id,
  name: `S${id}`,
  dsCode: "",
  city,
  country: "KSA",
  contractDuration: "",
  startDate: "",
  endDate: "",
  size: null,
  rentSARAnnual,
  rentSARMonthly: null,
  rentSARsqm,
  lat: null,
  lng: null,
});

describe("rentBenchmarks", () => {
  const stores = [
    store(1, "Riyadh", 400, 100_000),
    store(2, "Riyadh", 500, 200_000),
    store(3, "riyadh ", 600, 300_000), // same city, written differently
    store(4, "Riyadh", 800, 400_000),
    store(5, "Riyadh", null, 500_000),
    store(6, "Jeddah", 900, 600_000), // only two Jeddah rates: not compared
    store(7, "Jeddah", 300, null),
  ];
  const b = rentBenchmarks(stores, 25);

  it("compares each store with the median of its city (even count: middle two averaged)", () => {
    expect(b.of.get(1)).toEqual({ median: 550, cityCount: 4, diff: -27, level: "below" });
    expect(b.of.get(3)).toMatchObject({ median: 550, diff: 9, level: "above" });
    expect(b.of.get(4)).toMatchObject({ diff: 45, level: "high" });
  });

  it("doesn't compare without a rate, or in a city with fewer than 3 rates", () => {
    expect(b.of.get(5)).toMatchObject({ median: 550, diff: null, level: "none" });
    expect(b.of.get(6)).toEqual({ median: null, cityCount: 2, diff: null, level: "none" });
  });

  it("flags from the percentage in Settings", () => {
    expect(rentBenchmarks(stores, 50).of.get(4)?.level).toBe("above");
    expect(rentBenchmarks(stores, 0).of.get(3)?.level).toBe("high");
  });

  it("sizes pins by annual rent in thirds, small without a rent", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map((id) => b.sizeOf.get(id))).toEqual(["s", "s", "m", "m", "l", "l", "s"]);
  });
});
