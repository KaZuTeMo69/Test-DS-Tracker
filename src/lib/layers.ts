import { LayerKind, PolygonRings, Ring, Zone, ZoneLayer } from "../types";

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

// Colours offered for layers and zones, bright enough to read on the dark map
export const ZONE_COLORS = [
  "#FECC00",
  "#FB923C",
  "#F87171",
  "#F472B6",
  "#A78BFA",
  "#38BDF8",
  "#2DD4BF",
  "#4ADE80",
  "#E5E7EB",
  "#94A3B8",
];

export const DEFAULT_OPACITY = 0.15;

export const LAYER_KIND_LABEL: Record<LayerKind, string> = { coverage: "Coverage", whitespace: "White space" };

export const zoneColor = (zone: Zone, layer: ZoneLayer) => zone.color ?? layer.color;

/** The next colour for a new layer: the first one no layer uses yet. */
export function nextLayerColor(layers: ZoneLayer[], kind: LayerKind): string {
  if (kind === "whitespace") return "#E5E7EB";
  const used = new Set(layers.map((l) => l.color.toUpperCase()));
  return ZONE_COLORS.find((c) => !used.has(c)) ?? ZONE_COLORS[layers.length % ZONE_COLORS.length];
}

/** A file or layer name that says it's white space ("White space Riyadh", "whitespace.kml"). */
export const looksLikeWhiteSpace = (name: string) => /white[\s_-]*space/i.test(name);

// ── KML colours ──
// KML writes colours as aabbggrr hex: alpha first, then blue, green, red

export function kmlColorToHex(kml: string): { hex: string; alpha: number } | null {
  const m = kml.trim().match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return null;
  const [, a, b, g, r] = m;
  return { hex: `#${r}${g}${b}`.toUpperCase(), alpha: parseInt(a, 16) / 255 };
}

export function hexToKmlColor(hex: string, alpha = 1): string {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  const [r, g, b] = m ? [m[1], m[2], m[3]] : ["ff", "ff", "ff"];
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${a}${b}${g}${r}`.toLowerCase();
}

// ── Geometry ──

const RADIUS = 6378137; // metres, as used by Google Maps and GeoJSON tools
const rad = (deg: number) => (deg * Math.PI) / 180;

/** Area of a ring on the earth's surface in m² (spherical formula, as in Turf.js). */
function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [lat1, lng1] = ring[i];
    const [lat2, lng2] = ring[(i + 1) % ring.length];
    sum += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((sum * RADIUS * RADIUS) / 2);
}

const polygonArea = ([outer, ...holes]: PolygonRings) =>
  Math.max(0, ringArea(outer) - holes.reduce((sum, hole) => sum + ringArea(hole), 0));

/** A zone's area in km², holes left out. */
export const zoneAreaKm2 = (zone: Zone) => zone.polygons.reduce((sum, p) => sum + polygonArea(p), 0) / 1e6;

/** The zone's extent as [[south, west], [north, east]], or null for a zone with no points. */
export function zoneBounds(zones: Zone[]): [[number, number], [number, number]] | null {
  let south = Infinity;
  let west = Infinity;
  let north = -Infinity;
  let east = -Infinity;
  for (const zone of zones)
    for (const [outer] of zone.polygons)
      for (const [lat, lng] of outer) {
        south = Math.min(south, lat);
        north = Math.max(north, lat);
        west = Math.min(west, lng);
        east = Math.max(east, lng);
      }
  return south === Infinity
    ? null
    : [
        [south, west],
        [north, east],
      ];
}

// ── Saved layers ──
// Layers are read back from the browser's database, where old or damaged entries can turn up, so every
// field is checked. Anything unusable is dropped rather than breaking the map.

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v);
const text = (v: unknown) => (typeof v === "string" ? v : "");

function toPoint(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const [lat, lng] = v;
  return typeof lat === "number" && typeof lng === "number" && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
    ? [lat, lng]
    : null;
}

function toRing(v: unknown, min: number): Ring | null {
  if (!Array.isArray(v)) return null;
  const points = v.map(toPoint).filter((p): p is [number, number] => p !== null);
  return points.length >= min ? points : null;
}

function toZone(v: unknown): Zone | null {
  if (!v || typeof v !== "object") return null;
  const z = v as Record<string, unknown>;
  const polygons = (Array.isArray(z.polygons) ? z.polygons : [])
    .map((p): PolygonRings | null => {
      if (!Array.isArray(p)) return null;
      const [outer, ...holes] = p.map((r) => toRing(r, 3));
      return outer ? [outer, ...holes.filter((h): h is Ring => h !== null)] : null;
    })
    .filter((p): p is PolygonRings => p !== null);
  if (polygons.length === 0) return null;
  return {
    id: text(z.id) || newId(),
    name: text(z.name),
    description: text(z.description),
    color: isHex(z.color) ? z.color : null,
    polygons,
  };
}

/** A layer as saved, checked field by field; null when it isn't a layer this app saved. */
export function toLayer(v: unknown): ZoneLayer | null {
  if (!v || typeof v !== "object") return null;
  const l = v as Record<string, unknown>;
  // Every saved layer has an id, a name and a list of zones (empty for a new layer); without them it's damaged
  if (typeof l.id !== "string" || !l.id || typeof l.name !== "string" || !Array.isArray(l.zones)) return null;
  const zones = l.zones.map(toZone).filter((z): z is Zone => z !== null);
  const lines = (Array.isArray(l.lines) ? l.lines : [])
    .map((line) => {
      const r = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
      const points = toRing(r.points, 2);
      return points ? { id: text(r.id) || newId(), name: text(r.name), points } : null;
    })
    .filter((line): line is ZoneLayer["lines"][number] => line !== null);
  const opacity = typeof l.opacity === "number" && Number.isFinite(l.opacity) ? l.opacity : DEFAULT_OPACITY;
  return {
    id: l.id,
    name: l.name || "Untitled layer",
    kind: l.kind === "whitespace" ? "whitespace" : "coverage",
    visible: l.visible !== false,
    color: isHex(l.color) ? l.color : ZONE_COLORS[0],
    opacity: Math.min(1, Math.max(0, opacity)),
    source: text(l.source),
    zones,
    lines,
    created: typeof l.created === "number" ? l.created : 0,
  };
}
