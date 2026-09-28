import { describe, expect, it } from "vitest";
import { Store, Zone, ZoneLayer } from "../types";
import { analyseCoverage, coverageFlags, matchesCoverage, pointInZone } from "./coverage";

const square = (lat: number, lng: number, size: number): [number, number][] => [
  [lat, lng],
  [lat, lng + size],
  [lat + size, lng + size],
  [lat + size, lng],
];
const zone = (id: string, polygons: Zone["polygons"]): Zone => ({
  id,
  name: id,
  description: "",
  color: null,
  polygons,
});
const layer = (id: string, kind: ZoneLayer["kind"], zones: Zone[], visible = true): ZoneLayer => ({
  id,
  name: id,
  kind,
  visible,
  color: "#FECC00",
  opacity: 0.2,
  source: "",
  created: 0,
  zones,
  lines: [],
});
const store = (id: number, lat: number | null, lng: number | null) => ({ id, name: `S${id}`, lat, lng }) as Store;

describe("pointInZone", () => {
  const withHole = zone("h", [[square(0, 0, 10), square(4, 4, 2)]]);
  it("is inside the outer boundary but not in a hole", () => {
    expect(pointInZone(1, 1, withHole)).toBe(true);
    expect(pointInZone(5, 5, withHole)).toBe(false); // in the hole
    expect(pointInZone(11, 1, withHole)).toBe(false);
  });

  it("checks every part of a zone", () => {
    const parts = zone("p", [[square(0, 0, 1)], [square(5, 5, 1)]]);
    expect(pointInZone(5.5, 5.5, parts)).toBe(true);
    expect(pointInZone(3, 3, parts)).toBe(false);
  });

  it("handles concave shapes", () => {
    // An L shape: the notch at the top right is outside
    const l = zone("l", [
      [
        [
          [0, 0],
          [0, 10],
          [4, 10],
          [4, 4],
          [10, 4],
          [10, 0],
        ],
      ],
    ]);
    expect(pointInZone(2, 8, l)).toBe(true);
    expect(pointInZone(8, 8, l)).toBe(false);
  });
});

describe("analyseCoverage", () => {
  const A = zone("A", [[square(0, 0, 1)]]);
  const B = zone("B", [[square(0.5, 0.5, 1)]]); // overlaps A
  const C = zone("C", [[square(5, 5, 1)]]); // nobody in it
  const W = zone("W", [[square(0.9, 0.9, 0.2)]]);
  const layers = [layer("cov", "coverage", [A, B, C]), layer("ws", "whitespace", [W])];
  const stores = [
    store(1, 0.2, 0.2),
    store(2, 0.7, 0.7),
    store(3, 0.8, 0.6),
    store(4, 3, 3),
    store(5, 0.95, 0.95),
    store(6, null, null),
  ];
  const cov = analyseCoverage(stores, layers);

  it("lists the coverage zones each store is in", () => {
    expect(cov.zonesOf.get(1)?.map((z) => z.zoneId)).toEqual(["A"]);
    expect(cov.zonesOf.get(2)?.map((z) => z.zoneId)).toEqual(["A", "B"]);
    expect(cov.zonesOf.has(4)).toBe(false);
  });

  it("flags stores outside coverage, in white space, and without a location", () => {
    expect(cov.outside.map((s) => s.id)).toEqual([4]);
    expect(cov.inWhiteSpace.map((s) => s.id)).toEqual([5]);
    expect(cov.whiteSpaceOf.get(5)?.[0].zoneId).toBe("W");
    expect(cov.unchecked.map((s) => s.id)).toEqual([6]);
  });

  it("flags unserved zones and zones with 2 or more stores", () => {
    expect(cov.unserved.map((z) => z.zoneId)).toEqual(["C"]);
    expect(cov.overlapping.map((z) => z.zoneId)).toEqual(["A", "B"]);
    expect(cov.storesIn.get("A")?.map((s) => s.id)).toEqual([1, 2, 3, 5]);
  });

  it("names each zone with its colour, and adds up the white-space area", () => {
    expect(cov.zonesOf.get(1)?.[0]).toEqual({
      layerId: "cov",
      layerName: "cov",
      zoneId: "A",
      zoneName: "A",
      color: "#FECC00",
    });
    // 0.2° × 0.2° at the equator is about 22.3 km × 22.1 km
    expect(cov.whiteSpaceKm2).toBeGreaterThan(480);
    expect(cov.whiteSpaceKm2).toBeLessThan(500);
  });

  it("gives each store's flags, used by the list tags and the coverage filter", () => {
    const byId = (id: number) => stores.find((s) => s.id === id)!;
    expect(coverageFlags(cov, byId(1))).toEqual({ outside: false, inWhiteSpace: false });
    expect(coverageFlags(cov, byId(4))).toEqual({ outside: true, inWhiteSpace: false });
    expect(coverageFlags(cov, byId(5))).toEqual({ outside: false, inWhiteSpace: true });
    expect(coverageFlags(cov, byId(6))).toEqual({ outside: false, inWhiteSpace: false }); // no location: not checked
    expect(stores.filter((s) => matchesCoverage(cov, s, "outside")).map((s) => s.id)).toEqual([4]);
    expect(stores.filter((s) => matchesCoverage(cov, s, "whitespace")).map((s) => s.id)).toEqual([5]);
  });

  it("flags nothing without coverage zones, and ignores hidden layers", () => {
    const none = analyseCoverage(stores, [layer("ws", "whitespace", [W])]);
    expect(none.hasCoverage).toBe(false);
    expect(none.outside).toEqual([]);
    const hidden = analyseCoverage(stores, [layer("cov", "coverage", [A], false)]);
    expect(hidden.hasCoverage).toBe(false);
    expect(hidden.zonesOf.size).toBe(0);
  });
});
