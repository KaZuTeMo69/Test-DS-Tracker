import { describe, expect, it } from "vitest";
import { Store, ZoneLayer } from "../types";
import {
  checkPotential,
  createPotential,
  daysSince,
  editPotential,
  importPotentialsCsv,
  importPotentialsJson,
  manualStoresToPotentials,
  newPotentialId,
  Potential,
  PotentialDraft,
  potentialsToCsv,
  potentialsToKml,
  rentPerSqm,
  storeRowTsv,
  toStatus,
  withStatus,
  zonesAt,
  webLinkOrNull,
} from "./potentials";
import {
  KeyValueStore,
  localPotentialRepository,
  migrateManualStores,
  OLD_MANUAL_STORES_KEY,
  POTENTIALS_KEY,
} from "./potentialRepository";
import { cityRentMedians, compareToMedian, medianFor } from "./rentStats";
import { STORE_SHEET_HEADERS } from "./csvExport";

const NOW = new Date("2026-09-30T09:00:00Z");

const draft = (over: Partial<PotentialDraft> = {}): PotentialDraft => ({
  name: "Hittin corner",
  city: "Riyadh",
  district: "Hittin",
  lat: 24.7612,
  lng: 46.6021,
  status: "study",
  size: 400,
  askingRentAnnual: 320000,
  expectedOpd: null,
  contact: "",
  notes: "",
  feasibilityLink: "",
  dropReason: "",
  addedBy: "",
  ...over,
});

const potential = (over: Partial<Potential> = {}): Potential => ({
  ...createPotential(draft(), [], NOW),
  ...over,
});

function memoryStore(init: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe("Potential ids", () => {
  it("are POT- and 5 easy-to-read characters, never one already taken", () => {
    expect(newPotentialId()).toMatch(/^POT-[2-9A-HJKMNP-Z]{5}$/);
    // A random source that repeats itself: the second id has to differ from the first
    let calls = 0;
    const repeat = () => (calls++ < 5 ? 0 : 0.5);
    const first = newPotentialId([], () => 0);
    expect(newPotentialId([first], repeat)).not.toBe(first);
  });
});

describe("checks and the drop-reason rule", () => {
  it("needs a name, a city and a location", () => {
    expect(checkPotential(draft())).toEqual({});
    expect(checkPotential(draft({ name: " ", city: "" }))).toEqual({ name: "Enter a name", city: "Enter the city" });
    expect(checkPotential(draft({ lat: 120 })).location).toBeDefined();
  });

  it("a dropped Potential needs a reason; links must be full web links", () => {
    expect(checkPotential(draft({ status: "dropped" })).dropReason).toBe("Say why it was dropped");
    expect(checkPotential(draft({ status: "dropped", dropReason: "Landlord withdrew" }))).toEqual({});
    expect(checkPotential(draft({ feasibilityLink: "drive/study" })).feasibilityLink).toBeDefined();
    expect(checkPotential(draft({ feasibilityLink: "https://docs.google.com/x" }))).toEqual({});
  });

  it("dropping without a reason is refused; leaving dropped clears the reason; status time moves with the status", () => {
    const p = potential();
    expect(withStatus(p, "dropped", "  ", NOW)).toBeNull();
    const later = new Date("2026-10-02T09:00:00Z");
    const dropped = withStatus(p, "dropped", "Too far from the ring road", later)!;
    expect(dropped.status).toBe("dropped");
    expect(dropped.dropReason).toBe("Too far from the ring road");
    expect(dropped.statusChangedAt).toBe(later.toISOString());
    const back = withStatus(dropped, "backup", "", new Date("2026-10-05T09:00:00Z"))!;
    expect(back.dropReason).toBe("");
    // An edit that doesn't change the status keeps its time
    expect(editPotential(back, { notes: "Call again in Q1" }, new Date("2026-10-09")).statusChangedAt).toBe(
      back.statusChangedAt,
    );
  });

  it("reads statuses as written", () => {
    expect(toStatus("Approved")).toBe("approved");
    expect(toStatus(" dropped ")).toBe("dropped");
    expect(toStatus("maybe")).toBeNull();
  });
});

describe("rent per m² against the city median", () => {
  const store = (id: number, city: string, rent: number | null, size: number | null) =>
    ({ id, city, rentSARsqm: rent !== null && size ? rent / size : null }) as Store;

  it("is the asking rent over the size, compared as ±% with the city's store median", () => {
    const p = potential({ askingRentAnnual: 480000, size: 400 });
    expect(rentPerSqm(p)).toBe(1200);
    expect(rentPerSqm({ askingRentAnnual: 480000, size: null })).toBeNull();
    const stores = [store(1, "Riyadh", 400000, 400), store(2, "riyadh ", 500000, 500), store(3, "Riyadh", 300000, 200)];
    const medians = cityRentMedians(stores); // 1000, 1000, 1500 → median 1000
    const vs = compareToMedian(rentPerSqm(p), medianFor(medians, "Riyadh"), 25);
    expect(vs).toMatchObject({ median: 1000, diff: 20, level: "above" });
    expect(compareToMedian(1300, medianFor(medians, "RIYADH"), 25).level).toBe("high");
    expect(compareToMedian(900, medianFor(medians, "Riyadh"), 25)).toMatchObject({ diff: -10, level: "below" });
  });

  it("isn't compared with fewer than 3 stores in the city, or without a rate", () => {
    const medians = cityRentMedians([store(1, "Jeddah", 100000, 100), store(2, "Jeddah", 200000, 100)]);
    expect(compareToMedian(1500, medianFor(medians, "Jeddah"), 25)).toMatchObject({ median: null, level: "none" });
    expect(compareToMedian(null, medianFor(medians, "Jeddah"), 25).diff).toBeNull();
    expect(compareToMedian(1500, medianFor(medians, "Dammam"), 25).cityCount).toBe(0);
  });
});

describe("zones a Potential falls in", () => {
  const square = (lat: number, lng: number, d: number): [number, number][] => [
    [lat - d, lng - d],
    [lat - d, lng + d],
    [lat + d, lng + d],
    [lat + d, lng - d],
  ];
  const layer = (id: string, kind: "coverage" | "whitespace", visible = true): ZoneLayer => ({
    id,
    name: `${id} layer`,
    kind,
    visible,
    color: "#22c55e",
    opacity: 0.15,
    source: "",
    lines: [],
    created: 1,
    zones: [
      { id: `${id}-a`, name: "North", description: "", color: null, polygons: [[square(24.76, 46.6, 0.05)]] },
      { id: `${id}-b`, name: "", description: "", color: "#ff0000", polygons: [[square(21.5, 39.2, 0.05)]] },
    ],
  });

  it("finds the coverage and white-space zones around the point, on the layers shown", () => {
    const at = zonesAt(24.7612, 46.6021, [layer("cov", "coverage"), layer("ws", "whitespace")]);
    expect(at.coverage.map((z) => z.zoneName)).toEqual(["North"]);
    expect(at.whiteSpace.map((z) => z.zoneId)).toEqual(["ws-a"]);
    expect(at).toMatchObject({ hasCoverage: true, hasWhiteSpace: true });
  });

  it("ignores hidden layers, and says when the point is outside every zone", () => {
    expect(zonesAt(24.7612, 46.6021, [layer("cov", "coverage", false)])).toMatchObject({
      hasCoverage: false,
      coverage: [],
    });
    const outside = zonesAt(26.4, 50.1, [layer("cov", "coverage")]);
    expect(outside.hasCoverage).toBe(true);
    expect(outside.coverage).toEqual([]);
  });
});

describe("moving the old manual stores over", () => {
  const manual = JSON.stringify([
    { name: "Olaya scout", city: "Riyadh", lat: 24.69, lng: 46.68, dsCode: "MANUAL", size: 300, rentSARAnnual: 250000 },
    { name: "", city: "Riyadh", lat: 24.7, lng: 46.7 }, // damaged: no name
    { name: "Bad pin", city: "Jeddah", lat: 999, lng: 39 }, // damaged: no valid location
  ]);

  it("turns each into a Potential under study, with its rent as the asking rent", () => {
    const [p, ...rest] = manualStoresToPotentials(manual, new Set(), NOW);
    expect(rest).toHaveLength(0);
    expect(p).toMatchObject({
      name: "Olaya scout",
      city: "Riyadh",
      status: "study",
      size: 300,
      askingRentAnnual: 250000,
      createdAt: NOW.toISOString(),
    });
    expect(p.id).toMatch(/^POT-/);
    expect(manualStoresToPotentials("{oops", new Set(), NOW)).toEqual([]);
    expect(manualStoresToPotentials(null, new Set(), NOW)).toEqual([]);
  });

  it("moves them into dst.potentials once and deletes the old key", () => {
    const store = memoryStore({ [OLD_MANUAL_STORES_KEY]: manual });
    expect(migrateManualStores(store, NOW)).toBe(1);
    expect(store.data[OLD_MANUAL_STORES_KEY]).toBeUndefined();
    const saved = JSON.parse(store.data[POTENTIALS_KEY]);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Olaya scout");
    // Nothing left to move the second time
    expect(migrateManualStores(store, NOW)).toBe(0);
    expect(localPotentialRepository(store).list()).toHaveLength(1);
  });

  it("keeps Potentials already there, and doesn't add the same site twice", () => {
    const existing = potential({ name: "Olaya scout", lat: 24.69, lng: 46.68 });
    const store = memoryStore({ [OLD_MANUAL_STORES_KEY]: manual, [POTENTIALS_KEY]: JSON.stringify([existing]) });
    expect(migrateManualStores(store, NOW)).toBe(0);
    expect(
      localPotentialRepository(store)
        .list()
        .map((p) => p.id),
    ).toEqual([existing.id]);
  });
});

describe("the repository", () => {
  it("lists, adds, updates and removes, saving to dst.potentials", () => {
    const store = memoryStore();
    const repo = localPotentialRepository(store);
    const a = potential();
    const b = potential({ id: "POT-BBBBB", name: "Malqa plot" });
    repo.add(a);
    repo.add(b);
    repo.update({ ...a, name: "Hittin corner (updated)" });
    expect(repo.list().map((p) => p.name)).toEqual(["Hittin corner (updated)", "Malqa plot"]);
    repo.remove(a.id);
    // A fresh repository reads the same back from storage
    expect(
      localPotentialRepository(store)
        .list()
        .map((p) => p.id),
    ).toEqual(["POT-BBBBB"]);
    repo.remove(b.id);
    expect(store.data[POTENTIALS_KEY]).toBeUndefined();
  });

  it("skips damaged saved entries and duplicate ids", () => {
    const good = potential();
    const store = memoryStore({ [POTENTIALS_KEY]: JSON.stringify([good, { name: "x" }, good, 7]) });
    expect(localPotentialRepository(store).list()).toHaveLength(1);
    expect(localPotentialRepository(memoryStore({ [POTENTIALS_KEY]: "not json" })).list()).toEqual([]);
    // No storage at all (blocked): works for the visit
    const none = localPotentialRepository(null);
    none.add(good);
    expect(none.list()).toHaveLength(1);
  });
});

describe("CSV", () => {
  const list = [
    potential({ id: "POT-AAAAA", name: 'Corner "A", Olaya', notes: "Line one\nLine two", contact: "=Broker" }),
    potential({ id: "POT-BBBBB", name: "حي الملقا", status: "dropped", dropReason: "Too small", size: null }),
  ];

  it("round-trips: an exported file imports back to the same Potentials", () => {
    const csv = potentialsToCsv(list);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.split("\r\n")[0]).toMatch(/^﻿ID,Name,City,District,Lat,Lng,Status,Size \(m²\),Asking Rent/);
    const back = importPotentialsCsv(csv, [], NOW);
    expect(back).toMatchObject({ added: 2, updated: 0, skipped: 0 });
    // A cell starting with = is written with an apostrophe so spreadsheets don't run it
    expect(back.list[0].contact).toBe("'=Broker");
    expect(back.list.map((p) => ({ ...p, contact: "" }))).toEqual(list.map((p) => ({ ...p, contact: "" })));
  });

  it("merges by ID: a known ID is updated, others added (with a new ID when they have none)", () => {
    const csv = [
      "Name,City,Lat,Lng,Status,ID,Asking Rent",
      "Hittin corner v2,Riyadh,24.7612,46.6021,Approved,POT-AAAAA,500000",
      "New site,Jeddah,21.5,39.2,,,",
      "No place,Jeddah,,,Study,,",
    ].join("\n");
    const result = importPotentialsCsv(csv, list, NOW);
    expect(result).toMatchObject({ added: 1, updated: 1, skipped: 1 });
    const a = result.list.find((p) => p.id === "POT-AAAAA")!;
    expect(a).toMatchObject({ name: "Hittin corner v2", status: "approved", askingRentAnnual: 500000 });
    // The first added date stays when the row has none
    expect(a.createdAt).toBe(list[0].createdAt);
    const added = result.list.find((p) => p.name === "New site")!;
    expect(added.id).toMatch(/^POT-/);
    expect(added.status).toBe("study");
    expect(() => importPotentialsCsv("City,Lat\nRiyadh,24", [], NOW)).toThrow(/Name/);
  });

  it("imports JSON lists too", () => {
    const json = JSON.stringify({ potentials: [{ ...list[0], name: "From JSON" }, { name: "no pin" }] });
    const result = importPotentialsJson(json, list, NOW);
    expect(result).toMatchObject({ added: 0, updated: 1, skipped: 1 });
    expect(result.list.find((p) => p.id === "POT-AAAAA")!.name).toBe("From JSON");
    expect(() => importPotentialsJson("{bad", [], NOW)).toThrow(/Invalid JSON/);
  });
});

describe("KML and the store row", () => {
  it("writes each Potential as a pin coloured by status", () => {
    const kml = potentialsToKml([potential({ name: "A & B" })]);
    expect(kml).toContain("<name>A &amp; B</name>");
    expect(kml).toContain("<coordinates>46.6021,24.7612,0</coordinates>");
    expect(kml).toContain("#potential-study");
  });

  it("copies an approved Potential as a tab-separated row in the loaded sheet's column order", () => {
    const p = potential({ status: "approved", name: "Hittin\tcorner" });
    const headers = ["Lng", "Store Name", "DS Code", "Live / Not Live", "Notes", "Annual Rent W/O VAT", "Lat", "City"];
    expect(storeRowTsv(p, headers)).toBe(
      ["46.6021", "Hittin corner", "", "Not Live", "", "320000", "24.7612", "Riyadh"].join("\t"),
    );
    // Without a loaded sheet: the sample sheet's order
    const row = storeRowTsv(p, null).split("\t");
    expect(row).toHaveLength(STORE_SHEET_HEADERS.length);
    expect(row[STORE_SHEET_HEADERS.indexOf("Rent/sqm. (SAR)")]).toBe("800");
  });

  it("counts days since added", () => {
    expect(daysSince("2026-09-20T09:00:00Z", NOW)).toBe(10);
    expect(daysSince("2026-10-20T09:00:00Z", NOW)).toBe(0);
  });
});

describe("feasibility links", () => {
  it("only a web address is opened as a link; anything else (from the sheet or a file) stays text", () => {
    expect(webLinkOrNull(" https://drive.google.com/file/d/abc ")).toBe("https://drive.google.com/file/d/abc");
    expect(webLinkOrNull("http://example.com/study.pdf")).toBe("http://example.com/study.pdf");
    expect(webLinkOrNull("javascript:alert(1)")).toBeNull();
    expect(webLinkOrNull("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(webLinkOrNull("see the shared drive")).toBeNull();
    expect(webLinkOrNull("")).toBeNull();
  });
});
