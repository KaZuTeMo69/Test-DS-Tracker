import { describe, expect, it } from "vitest";
import { Zone } from "../types";
import { hexToKmlColor, kmlColorToHex, looksLikeWhiteSpace, toLayer, zoneAreaKm2, zoneBounds } from "./layers";

// About 1 km × 1 km in Riyadh: 1 km is 0.008983° of latitude, and 0.009888° of longitude at 24.7°N
const KM_SQUARE: [number, number][] = [
  [24.7, 46.6],
  [24.7, 46.609888],
  [24.708983, 46.609888],
  [24.708983, 46.6],
];
const zone = (polygons: Zone["polygons"]): Zone => ({ id: "z", name: "", description: "", color: null, polygons });

describe("KML colours", () => {
  it("converts aabbggrr to #rrggbb and back", () => {
    expect(kmlColorToHex("ffd18802")).toEqual({ hex: "#0288D1", alpha: 1 });
    expect(kmlColorToHex("4cd18802")?.alpha).toBeCloseTo(0.298, 2);
    expect(hexToKmlColor("#0288D1")).toBe("ffd18802");
    expect(hexToKmlColor("#0288D1", 0.3)).toBe("4dd18802"); // 0.3 × 255 = 76.5, rounded to 77 (0x4d)
    expect(kmlColorToHex("blue")).toBeNull();
  });
});

describe("zoneAreaKm2", () => {
  it("measures a 1 km square as about 1 km²", () => {
    expect(zoneAreaKm2(zone([[KM_SQUARE]]))).toBeCloseTo(1, 1);
  });

  it("leaves holes out and adds up parts", () => {
    const hole: [number, number][] = KM_SQUARE.map(([lat, lng]) => [24.7 + (lat - 24.7) / 2, 46.6 + (lng - 46.6) / 2]);
    expect(zoneAreaKm2(zone([[KM_SQUARE, hole]]))).toBeCloseTo(0.75, 1);
    expect(zoneAreaKm2(zone([[KM_SQUARE], [KM_SQUARE]]))).toBeCloseTo(2, 1);
  });
});

describe("zoneBounds", () => {
  it("covers every part of every zone", () => {
    expect(zoneBounds([zone([[KM_SQUARE]])])).toEqual([
      [24.7, 46.6],
      [24.708983, 46.609888],
    ]);
    expect(zoneBounds([])).toBeNull();
  });
});

describe("looksLikeWhiteSpace", () => {
  it("spots white-space names", () => {
    expect(looksLikeWhiteSpace("White space Riyadh")).toBe(true);
    expect(looksLikeWhiteSpace("whitespace.kmz")).toBe(true);
    expect(looksLikeWhiteSpace("white-space")).toBe(true);
    expect(looksLikeWhiteSpace("Riyadh coverage")).toBe(false);
  });
});

describe("toLayer (reading saved layers back)", () => {
  const good = {
    id: "L1",
    name: "Riyadh",
    kind: "whitespace",
    visible: false,
    color: "#38BDF8",
    opacity: 0.4,
    source: "riyadh.kml",
    created: 5,
    zones: [{ id: "z1", name: "A", description: "d", color: "#FF0000", polygons: [[KM_SQUARE]] }],
    lines: [
      {
        id: "l1",
        name: "Road",
        points: [
          [24.7, 46.6],
          [24.8, 46.7],
        ],
      },
    ],
  };

  it("keeps a valid layer as it was", () => {
    expect(toLayer(good)).toEqual(good);
  });

  it("drops damaged parts and fills in safe defaults", () => {
    const layer = toLayer({
      ...good,
      kind: "something",
      color: "blue",
      opacity: 7,
      visible: undefined,
      zones: [
        good.zones[0],
        { id: "z2", polygons: [[[[24.7, 46.6], [24.7]]]] }, // fewer than 3 valid points
        null,
        { id: "z3", polygons: [[KM_SQUARE, [[999, 1]]]], color: "red" }, // bad hole dropped, bad colour reset
      ],
      lines: [{ points: [[24.7, 46.6]] }],
    })!;
    expect(layer.kind).toBe("coverage");
    expect(layer.color).toBe("#FECC00");
    expect(layer.opacity).toBe(1);
    expect(layer.visible).toBe(true);
    expect(layer.zones.map((z) => z.id)).toEqual(["z1", "z3"]);
    expect(layer.zones[1].polygons[0]).toHaveLength(1);
    expect(layer.zones[1].color).toBeNull();
    expect(layer.lines).toHaveLength(0);
  });

  it("rejects entries that aren't layers", () => {
    expect(toLayer(null)).toBeNull();
    expect(toLayer("x")).toBeNull();
    expect(toLayer({ name: "no id", zones: [] })).toBeNull();
    expect(toLayer({ id: "x", name: 5, zones: [] })).toBeNull();
    expect(toLayer({ id: "x", name: "No zone list", zones: "nope" })).toBeNull();
  });

  it("keeps an empty layer made in the app", () => {
    expect(toLayer({ id: "x", name: "White space", zones: [] })?.zones).toEqual([]);
  });
});
