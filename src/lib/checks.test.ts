import { describe, expect, it } from "vitest";
import { Store } from "../types";
import { dataIssues, dataQuality, storeIssues } from "./checks";

const store = (id: number, over: Partial<Store> = {}): Store => ({
  id,
  name: `S${id}`,
  dsCode: `DS-${id}`,
  city: "Riyadh",
  country: "KSA",
  contractDuration: "2",
  startDate: "01/01/2025",
  endDate: "31/12/2026",
  live: "Live",
  paid: "Paid",
  size: 400,
  rentSARAnnual: 240000,
  rentSARMonthly: 20000,
  rentSARsqm: 600,
  lat: 24.7,
  lng: 46.7,
  ...over,
});

describe("storeIssues", () => {
  it("finds nothing wrong with a complete store", () => {
    expect(storeIssues(store(1))).toEqual([]);
  });

  it("gives each problem a kind and the text shown in the store card", () => {
    const s = store(2, {
      lat: null,
      lng: null,
      locationIssue: "Coordinates are outside Saudi Arabia",
      rentSARAnnual: null,
      live: "maybe",
      paid: "",
    });
    expect(storeIssues(s).map((i) => i.kind)).toEqual(["location", "rent", "liveStatus", "paidStatus"]);
    expect(dataIssues(s)).toEqual([
      "Coordinates are outside Saudi Arabia. Not shown on the map.",
      "Annual rent is missing.",
      'Live status "maybe" isn\'t recognised. Counted as Not Live.',
      "Payment status is blank. Counted as Unpaid.",
    ]);
    expect(dataIssues(s, { location: false, status: false })).toEqual(["Annual rent is missing."]);
  });

  it("tells the contract date problems apart", () => {
    const kinds = (over: Partial<Store>) => storeIssues(store(3, over)).map((i) => i.kind);
    expect(kinds({ startDate: "", endDate: "" })).toEqual(["startMissing"]);
    expect(kinds({ startDate: "someday", endDate: "" })).toEqual(["startUnreadable"]);
    expect(kinds({ endDate: "31/02/2026" })).toEqual(["endUnreadable"]);
    expect(kinds({ endDate: "", contractDuration: "" })).toEqual(["durationMissing"]);
    expect(kinds({ endDate: "", contractDuration: "a while" })).toEqual(["durationUnknown"]);
  });
});

describe("durations", () => {
  it("warns about a bare .1, which may have been typed as .10 (Sheets drops the zero)", () => {
    const issues = storeIssues(store(5, { contractDuration: "0.1", endDate: "" }));
    expect(issues.map((i) => i.kind)).toEqual(["durationAmbiguous"]);
    expect(issues[0].text).toBe(
      "Contract duration \"0.1\" could be 1 month or 10 months (Sheets drops trailing zeros). Write 10/11 months as text, e.g. '1y 10m'.",
    );
    expect(storeIssues(store(6, { contractDuration: "1.1+1" })).map((i) => i.kind)).toEqual(["durationAmbiguous"]);
    expect(storeIssues(store(7, { contractDuration: "1.11" }))).toEqual([]);
  });

  it("a months part over 11 isn't a duration: with no end date it's reported", () => {
    const issues = storeIssues(store(8, { contractDuration: "0.12", endDate: "" }));
    expect(issues.map((i) => i.kind)).toEqual(["durationUnknown"]);
  });
});

describe("dataQuality", () => {
  const stores = [
    store(1),
    store(2, { rentSARAnnual: null, size: null }),
    store(3, { rentSARAnnual: null }),
    store(4, { dsCode: "ds-1 " }), // the same code as store 1, written differently
    store(5, { lat: null, lng: null }),
  ];
  const q = dataQuality(stores);

  it("groups stores by problem, in a fixed order, with only the groups that have stores", () => {
    expect(q.groups.map((g) => [g.kind, g.items.map((i) => i.store.id)])).toEqual([
      ["location", [5]],
      ["rent", [2, 3]],
      ["area", [2]],
      ["duplicateCode", [1, 4]],
    ]);
    expect(q.groups[0].title).toBe("No location on the map");
    expect(q.groups[0].fix).toMatch(/Lat and Lng/);
  });

  it("counts each store with a problem once", () => {
    expect(q.storesWithIssues).toBe(5);
    expect(dataQuality([store(1), store(2)]).storesWithIssues).toBe(0);
  });

  it("says which code is shared and with how many others", () => {
    const dup = q.groups.find((g) => g.kind === "duplicateCode")!;
    expect(dup.items[0].detail).toBe("DS-1 is also used by 1 other store.");
  });
});
