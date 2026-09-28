// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import L from "leaflet";
import { toPolygons } from "./geoman";

const ll = (pts: [number, number][]) => pts.map(([lat, lng]) => L.latLng(lat, lng));
const RING: [number, number][] = [
  [24.7, 46.6],
  [24.7, 46.7],
  [24.8, 46.7],
];

describe("toPolygons", () => {
  it("reads one ring, a polygon with a hole, and several polygons", () => {
    expect(toPolygons(ll(RING))).toEqual([[RING]]);
    const hole: [number, number][] = [
      [24.72, 46.65],
      [24.72, 46.66],
      [24.73, 46.66],
    ];
    expect(toPolygons([ll(RING), ll(hole)])).toEqual([[RING, hole]]);
    expect(toPolygons([[ll(RING)], [ll(RING)]])).toEqual([[RING], [RING]]);
  });

  it("drops the closing point and repeats, rounds to 7 decimals, and skips shapes under 3 points", () => {
    expect(toPolygons(ll([...RING, [24.7, 46.6]]))).toEqual([[RING]]);
    expect(
      toPolygons(
        ll([
          [24.123456789, 46.1],
          [24.123456789, 46.1],
          [24.2, 46.2],
          [24.3, 46.1],
        ]),
      ),
    ).toEqual([
      [
        [
          [24.1234568, 46.1],
          [24.2, 46.2],
          [24.3, 46.1],
        ],
      ],
    ]);
    expect(toPolygons(ll(RING.slice(0, 2)))).toEqual([]);
  });
});
