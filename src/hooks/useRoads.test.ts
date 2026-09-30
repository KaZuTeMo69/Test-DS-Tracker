import { describe, expect, it } from "vitest";
import { Store } from "../types";
import { byDriveTime, NearbyRow } from "./useRoads";

const row = (
  id: number,
  air: number,
  road: { distance: number | null; duration: number | null } | null,
): NearbyRow => ({
  store: { id, name: `S${id}` } as Store,
  air,
  road,
});

describe("nearest stores by drive time", () => {
  it("lists by drive time first, road km second; no road answer last, nearest by air first", () => {
    const rows = [
      row(1, 1000, { distance: 5000, duration: 600 }),
      row(2, 800, { distance: 3000, duration: 420 }),
      row(3, 900, { distance: 2500, duration: 420 }), // same time as 2, shorter road
      row(4, 500, null),
      row(5, 400, { distance: null, duration: null }),
      row(6, 1500, { distance: 9000, duration: 300 }), // farther by air and road, but quickest
    ];
    expect(byDriveTime(rows).map((r) => r.store.id)).toEqual([6, 3, 2, 1, 5, 4]);
  });
});
