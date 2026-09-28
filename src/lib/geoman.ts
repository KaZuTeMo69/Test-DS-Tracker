import L from "leaflet";
import { PolygonRings, Ring } from "../types";

// Leaflet-Geoman (drawing and shape editing) is ~290 KB, so it's downloaded when drawing or editing first
// starts. Like the route plugin, it finds Leaflet on window.L, which Leaflet sets itself.
let ready: Promise<void> | null = null;

export function loadGeoman(): Promise<void> {
  ready ??= Promise.all([
    import("@geoman-io/leaflet-geoman-free"),
    import("@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css"),
  ])
    .then(() => undefined)
    .catch((err) => {
      ready = null; // try again next time
      throw err;
    });
  return ready;
}

// The class Geoman itself attaches to each new map; it isn't in its type definitions
type PMMapClass = new (map: L.Map) => L.PM.PMMap;

/** Geoman sets itself up on maps created after it loads. This map was created before, so it's set up here. */
export function geomanFor(map: L.Map): L.PM.PMMap {
  if (!map.pm) {
    map.pm = new (L.PM as unknown as { Map: PMMapClass }).Map(map);
    map.pm.setGlobalOptions({});
  }
  return map.pm;
}

// 7 decimals is about 1 cm, more than enough for a zone boundary
const round = (n: number) => Math.round(n * 1e7) / 1e7;

function toRing(points: L.LatLng[]): Ring | null {
  const ring: Ring = [];
  for (const p of points) {
    const point: [number, number] = [round(p.lat), round(p.lng)];
    const last = ring[ring.length - 1];
    if (!last || last[0] !== point[0] || last[1] !== point[1]) ring.push(point);
  }
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring.length >= 3 ? ring : null;
}

function toPolygon(rings: L.LatLng[][]): PolygonRings | null {
  const [outer, ...holes] = rings.map(toRing);
  return outer ? [outer, ...holes.filter((h): h is Ring => h !== null)] : null;
}

type LatLngs = L.LatLng[] | L.LatLng[][] | L.LatLng[][][];

/** A Leaflet polygon's points (one ring, one polygon with holes, or several polygons) as zone polygons. */
export function toPolygons(latlngs: LatLngs): PolygonRings[] {
  const isFlat = (a: unknown[]) => a.length === 0 || a[0] instanceof L.LatLng;
  let polygons: (PolygonRings | null)[];
  if (isFlat(latlngs)) polygons = [toPolygon([latlngs as L.LatLng[]])];
  else if (isFlat(latlngs[0] as unknown[])) polygons = [toPolygon(latlngs as L.LatLng[][])];
  else polygons = (latlngs as L.LatLng[][][]).map(toPolygon);
  return polygons.filter((p): p is PolygonRings => p !== null);
}
