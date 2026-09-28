import { CoverageFilter, PolygonRings, Ring, Store, Zone, ZoneLayer } from "../types";
import { hasCoords } from "./checks";
import { zoneAreaKm2, zoneColor } from "./layers";

/** A zone, with enough about it to name it, show its colour and select it. */
export interface ZoneHit {
  layerId: string;
  layerName: string;
  zoneId: string;
  zoneName: string;
  color: string;
}

export interface Coverage {
  hasCoverage: boolean; // any coverage zones shown on the map (without them no store is flagged)
  hasWhiteSpace: boolean;
  zonesOf: Map<number, ZoneHit[]>; // store id → coverage zones it's in
  whiteSpaceOf: Map<number, ZoneHit[]>; // store id → white-space zones it's in
  storesIn: Map<string, Store[]>; // zone id (coverage or white space) → stores inside
  coverageZones: ZoneHit[];
  whiteSpaceZones: ZoneHit[];
  unserved: ZoneHit[]; // coverage zones with no store inside
  overlapping: ZoneHit[]; // coverage zones with 2 or more stores inside
  outside: Store[]; // stores with a location that's in no coverage zone
  inWhiteSpace: Store[];
  unchecked: Store[]; // stores without a location
  whiteSpaceKm2: number; // total area of the white-space zones
}

// Ray casting on latitude/longitude, which is accurate at the scale of city zones
function inRing(lat: number, lng: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [latI, lngI] = ring[i];
    const [latJ, lngJ] = ring[j];
    if (latI > lat !== latJ > lat && lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI) inside = !inside;
  }
  return inside;
}

const inPolygon = (lat: number, lng: number, [outer, ...holes]: PolygonRings) =>
  inRing(lat, lng, outer) && !holes.some((hole) => inRing(lat, lng, hole));

/** Whether a point is in the zone: in one of its parts, and not in a hole. */
export const pointInZone = (lat: number, lng: number, zone: Zone) =>
  zone.polygons.some((polygon) => inPolygon(lat, lng, polygon));

// Each zone's extent, so most stores are ruled out without the full check
function extent(zone: Zone) {
  let [south, west, north, east] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [outer] of zone.polygons)
    for (const [lat, lng] of outer) {
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lng);
      east = Math.max(east, lng);
    }
  return { south, west, north, east };
}

/**
 * Which coverage and white-space zones each store is in, and the zones and stores that need attention.
 * Only layers shown on the map count, so hiding an outdated layer takes it out of the checks.
 */
export function analyseCoverage(stores: Store[], layers: ZoneLayer[]): Coverage {
  const shown = layers.filter((l) => l.visible);
  const zones = shown.flatMap((layer) =>
    layer.zones.map((zone) => ({
      zone,
      kind: layer.kind,
      box: extent(zone),
      hit: {
        layerId: layer.id,
        layerName: layer.name,
        zoneId: zone.id,
        zoneName: zone.name || "Unnamed zone",
        color: zoneColor(zone, layer),
      },
    })),
  );
  const result: Coverage = {
    hasCoverage: zones.some((z) => z.kind === "coverage"),
    hasWhiteSpace: zones.some((z) => z.kind === "whitespace"),
    zonesOf: new Map(),
    whiteSpaceOf: new Map(),
    storesIn: new Map(zones.map((z) => [z.zone.id, []])),
    coverageZones: zones.filter((z) => z.kind === "coverage").map((z) => z.hit),
    whiteSpaceZones: zones.filter((z) => z.kind === "whitespace").map((z) => z.hit),
    unserved: [],
    overlapping: [],
    outside: [],
    inWhiteSpace: [],
    unchecked: [],
    whiteSpaceKm2: zones.reduce((sum, z) => sum + (z.kind === "whitespace" ? zoneAreaKm2(z.zone) : 0), 0),
  };

  for (const store of stores) {
    const { lat, lng } = store;
    if (lat === null || lng === null) {
      result.unchecked.push(store);
      continue;
    }
    const coverage: ZoneHit[] = [];
    const whiteSpace: ZoneHit[] = [];
    for (const z of zones) {
      if (lat < z.box.south || lat > z.box.north || lng < z.box.west || lng > z.box.east) continue;
      if (!pointInZone(lat, lng, z.zone)) continue;
      (z.kind === "coverage" ? coverage : whiteSpace).push(z.hit);
      result.storesIn.get(z.zone.id)!.push(store);
    }
    if (coverage.length) result.zonesOf.set(store.id, coverage);
    else if (result.hasCoverage) result.outside.push(store);
    if (whiteSpace.length) {
      result.whiteSpaceOf.set(store.id, whiteSpace);
      result.inWhiteSpace.push(store);
    }
  }

  for (const hit of result.coverageZones) {
    const count = result.storesIn.get(hit.zoneId)!.length;
    if (count === 0) result.unserved.push(hit);
    if (count >= 2) result.overlapping.push(hit);
  }
  return result;
}

/** Whether a store is flagged: outside every coverage zone (when there are any), or inside white space. */
export function coverageFlags(coverage: Coverage, store: Store) {
  return {
    outside: coverage.hasCoverage && hasCoords(store) && !coverage.zonesOf.has(store.id),
    inWhiteSpace: coverage.whiteSpaceOf.has(store.id),
  };
}

/** Whether a store belongs in the "outside coverage" or "in white space" list. */
export const matchesCoverage = (coverage: Coverage, store: Store, filter: CoverageFilter) =>
  coverageFlags(coverage, store)[filter === "outside" ? "outside" : "inWhiteSpace"];
