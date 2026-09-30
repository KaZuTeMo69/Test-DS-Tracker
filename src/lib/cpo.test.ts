import { describe, expect, it } from "vitest";
import { Store } from "../types";
import {
  costPerOrder,
  cpoBenchmarks,
  networkFigures,
  opdCpoScatter,
  opdLevels,
  potentialTargets,
  quadrant,
  storeCpo,
} from "./cpo";
import { parseCSVData, rowsToStores } from "./importer";
import { dataQuality, storeIssues } from "./checks";

const store = (id: number, over: Partial<Store> = {}): Store => ({
  id,
  name: `S${id}`,
  dsCode: `DS-${id}`,
  city: "Riyadh",
  country: "KSA",
  contractDuration: "2",
  startDate: "01 Jan 2025",
  endDate: "31 Dec 2026",
  live: "Live",
  paid: "Paid",
  size: 400,
  rentSARAnnual: 360000,
  rentSARMonthly: 30000,
  rentSARsqm: 900,
  lat: 24.7,
  lng: 46.7,
  opd: 100,
  ...over,
});

describe("CPO", () => {
  it("is annual rent / 12 / 30 / OPD (the 360-day convention)", () => {
    expect(costPerOrder(360000, 100)).toBe(10);
    expect(costPerOrder(240000, 50)).toBeCloseTo(13.33, 2);
    expect(storeCpo(store(1))).toBe(10);
  });

  it("is null when OPD is missing or 0, or there's no rent", () => {
    expect(costPerOrder(360000, null)).toBeNull();
    expect(costPerOrder(360000, undefined)).toBeNull();
    expect(costPerOrder(360000, 0)).toBeNull();
    expect(costPerOrder(null, 100)).toBeNull();
  });

  it("uses the annualised rent for a contract under 12 months", () => {
    // 6 months at 180,000 for the term → 360,000 a year → CPO 10 at 100 orders a day, not 5
    const [s] = parseCSVData(
      "Store Name,Contract Duration,Contract Start Date,Annual Rent W/O VAT,OPD\nShort,0.6,01/01/2026,180000,100",
    );
    expect(s.rentSARAnnual).toBe(360000);
    expect(storeCpo(s)).toBe(10);
  });
});

describe("the network's CPO", () => {
  it("is weighted by orders (total rent / 360 / total OPD), not the plain average", () => {
    const stores = [
      store(1, { rentSARAnnual: 360000, opd: 100 }), // CPO 10
      store(2, { rentSARAnnual: 360000, opd: 900 }), // CPO 1.11
    ];
    const n = networkFigures(stores);
    expect(n.opd).toBe(1000);
    expect(n.cpo).toBeCloseTo(720000 / 360 / 1000, 5); // 2
    expect(n.simpleCpo).toBeCloseTo((10 + 360000 / 360 / 900) / 2, 5); // 5.56
    expect(n.included).toBe(2);
  });

  it("leaves out stores without an OPD, and those with an OPD but no rent (they still count in the OPD)", () => {
    const n = networkFigures([
      store(1, { rentSARAnnual: 360000, opd: 100 }),
      store(2, { opd: null }),
      store(3, { opd: 0 }),
      store(4, { rentSARAnnual: null, opd: 50 }),
    ]);
    expect(n).toMatchObject({ opd: 150, withOpd: 2, included: 1, cpo: 10 });
    expect(networkFigures([store(1, { opd: null })]).cpo).toBeNull();
  });
});

describe("OPD against CPO", () => {
  it("puts each store in a quadrant by the medians (at the median counts as low)", () => {
    expect(quadrant(200, 12, 100, 10)).toBe("split"); // busy and costly
    expect(quadrant(50, 12, 100, 10)).toBe("review"); // quiet and costly
    expect(quadrant(200, 8, 100, 10)).toBe("strong"); // busy and cheap
    expect(quadrant(50, 8, 100, 10)).toBe("grow"); // quiet and cheap
    expect(quadrant(100, 10, 100, 10)).toBe("grow");
  });

  it("uses only stores with an OPD and a CPO, and their medians", () => {
    const stores = [
      store(1, { opd: 100, rentSARAnnual: 360000 }), // cpo 10
      store(2, { opd: 300, rentSARAnnual: 1080000 }), // cpo 10
      store(3, { opd: 200, rentSARAnnual: 1440000 }), // cpo 20
      store(4, { opd: null }),
      store(5, { opd: 50, rentSARAnnual: null }),
    ];
    const s = opdCpoScatter(stores);
    expect(s.points.map((p) => p.store.id)).toEqual([1, 2, 3]);
    expect(s.medianOpd).toBe(200);
    expect(s.medianCpo).toBe(10);
    expect(s.points.map((p) => p.quadrant)).toEqual(["grow", "strong", "review"]);
    expect(opdCpoScatter([store(1, { opd: 0 })]).points).toEqual([]);
  });
});

describe("pin colours", () => {
  it("OPD by quartile of the stores with one", () => {
    const stores = [10, 20, 30, 40, 50, 60, 70, 80].map((opd, i) => store(i + 1, { opd }));
    const levels = opdLevels([...stores, store(99, { opd: null })]);
    expect([...levels.values()]).toEqual(["q1", "q1", "q2", "q2", "q3", "q3", "q4", "q4", "none"]);
  });

  it("CPO against the city median, in the same bands as rent per m²", () => {
    const stores = [
      store(1, { opd: 100 }), // 10
      store(2, { opd: 100 }), // 10
      store(3, { opd: 80 }), // 12.5: 25% above
      store(4, { opd: 50 }), // 20: 100% above
      store(5, { opd: 120 }), // 8.33
    ];
    const b = cpoBenchmarks(stores, 25);
    expect(b.get(1)).toMatchObject({ median: 10, level: "below" });
    expect(b.get(3)).toMatchObject({ diff: 25, level: "above" });
    expect(b.get(4)).toMatchObject({ diff: 100, level: "high" });
    expect(cpoBenchmarks([store(1), store(2)], 25).get(1)?.level).toBe("none"); // fewer than 3 in the city
  });
});

describe("a Potential against the target CPO", () => {
  it("estimated CPO, the OPD needed at the asking rent, the most rent at the expected OPD", () => {
    const t = potentialTargets(360000, 80, 10);
    expect(t.estimatedCpo).toBe(12.5); // 360,000 / 360 / 80
    expect(t.minOpd).toBe(100); // 360,000 / 360 / 10
    expect(t.maxRent).toBe(288000); // 10 × 360 × 80
  });

  it("each needs its inputs", () => {
    expect(potentialTargets(360000, null, 10)).toEqual({ estimatedCpo: null, minOpd: 100, maxRent: null });
    expect(potentialTargets(null, 80, 10)).toEqual({ estimatedCpo: null, minOpd: null, maxRent: 288000 });
    expect(potentialTargets(360000, 80, null)).toEqual({ estimatedCpo: 12.5, minOpd: null, maxRent: null });
    expect(potentialTargets(360000, 0, 0)).toEqual({ estimatedCpo: null, minOpd: null, maxRent: null });
  });
});

describe("OPD in the data", () => {
  it('reads "OPD", "Orders per day" or "Orders/Day", and "OPD As Of" as written', () => {
    const [a] = rowsToStores(["Store Name", "OPD", "OPD As Of"], [["A", "1,250", "Aug 2026"]]);
    expect(a).toMatchObject({ opd: 1250, opdAsOf: "Aug 2026" });
    expect(rowsToStores(["Store Name", "Orders per day"], [["B", "300"]])[0].opd).toBe(300);
    expect(rowsToStores(["Store Name", "Orders/Day"], [["C", "40"]])[0].opd).toBe(40);
    // "OPD As Of" isn't taken for the OPD when it comes first
    expect(rowsToStores(["Store Name", "OPD As Of", "OPD"], [["D", "Sep 2026", "90"]])[0]).toMatchObject({
      opd: 90,
      opdAsOf: "Sep 2026",
    });
  });

  it("Data Quality: a live store with no OPD (once there's an OPD column), and OPD on a store that isn't live", () => {
    const stores = [store(1), store(2, { opd: null }), store(3, { live: "Not Live", opd: 40 })];
    const q = dataQuality(stores);
    const items = (kind: string) => q.groups.find((g) => g.kind === kind)?.items.map((i) => i.store.id);
    expect(items("opdMissing")).toEqual([2]);
    expect(items("opdNotLive")).toEqual([3]);
    expect(storeIssues(stores[2]).map((i) => i.kind)).toEqual(["opdNotLive"]);
    // Without any OPD in the data, no store is listed for it
    expect(dataQuality([store(1, { opd: null }), store(2, { opd: null })]).groups).toEqual([]);
  });
});
