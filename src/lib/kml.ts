import { strFromU8, unzipSync } from "fflate";
import { MapLine, PolygonRings, Ring, Zone } from "../types";
import { kmlColorToHex, newId } from "./layers";

export interface ParsedKml {
  name: string; // the file's own name for its content (<Document><name>), if it has one
  zones: Zone[];
  lines: MapLine[];
  skippedPoints: number; // map markers, which aren't zones
}

// Tags are matched by their local name in any namespace, so files that prefix them (<kml:Placemark>) work too
const all = (el: Element | Document, tag: string) => Array.from(el.getElementsByTagNameNS("*", tag));
const child = (el: Element, tag: string) => Array.from(el.children).find((c) => c.localName === tag);
const childText = (el: Element, tag: string) => child(el, tag)?.textContent?.trim() ?? "";

/** KML descriptions are often HTML (My Maps and Google Earth add line breaks and links). Only the text is kept. */
function plainText(html: string): string {
  if (!/[<&]/.test(html)) return html.trim();
  const withBreaks = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n");
  const doc = new DOMParser().parseFromString(withBreaks, "text/html");
  doc.querySelectorAll("script, style").forEach((el) => el.remove());
  return (doc.body.textContent ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** "lng,lat[,alt] lng,lat ..." as [lat, lng] points, without repeats. */
function parsePoints(text: string | null | undefined): [number, number][] {
  const points: [number, number][] = [];
  for (const tuple of (text ?? "").trim().split(/\s+/)) {
    const [lng, lat] = tuple.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const last = points[points.length - 1];
    if (!last || last[0] !== lat || last[1] !== lng) points.push([lat, lng]);
  }
  return points;
}

/** A polygon boundary's points without the closing point, or null if it has fewer than 3. */
function parseRing(boundary: Element | undefined): Ring | null {
  const coords = boundary && all(boundary, "coordinates")[0];
  const ring = parsePoints(coords?.textContent);
  const [first, last] = [ring[0], ring[ring.length - 1]];
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring.pop();
  return ring.length >= 3 ? ring : null;
}

/** Colours from <Style id> and <StyleMap id> (whose "normal" pair points at a style). */
function readStyles(doc: Document) {
  const colorOf = (style: Element) => {
    const line = all(style, "LineStyle")[0];
    const poly = all(style, "PolyStyle")[0];
    // The outline colour is what shows most on the map; My Maps gives both the same colour
    const kml = (line && childText(line, "color")) || (poly && childText(poly, "color")) || "";
    return kmlColorToHex(kml)?.hex ?? null;
  };
  const styles = new Map<string, string | null>();
  for (const style of all(doc, "Style")) {
    const id = style.getAttribute("id");
    if (id) styles.set(id, colorOf(style));
  }
  for (const map of all(doc, "StyleMap")) {
    const id = map.getAttribute("id");
    const normal = all(map, "Pair").find((p) => childText(p, "key") === "normal");
    const target = normal ? childText(normal, "styleUrl").replace(/^.*#/, "") : "";
    if (id && styles.has(target)) styles.set(id, styles.get(target)!);
  }
  return { styles, colorOf };
}

/** Reads the polygons (with their names, descriptions and colours) and lines in a KML document. */
export function parseKML(text: string): ParsedKml {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length || !all(doc, "kml").length) {
    throw new Error("it isn't a KML file");
  }
  const { styles, colorOf } = readStyles(doc);
  const documentEl = all(doc, "Document")[0];
  const result: ParsedKml = {
    name: documentEl ? childText(documentEl, "name") : "",
    zones: [],
    lines: [],
    skippedPoints: 0,
  };

  for (const pm of all(doc, "Placemark")) {
    const name = childText(pm, "name");
    const description = plainText(childText(pm, "description"));
    const inlineStyle = child(pm, "Style");
    const color = inlineStyle
      ? colorOf(inlineStyle)
      : (styles.get(childText(pm, "styleUrl").replace(/^.*#/, "")) ?? null);

    // Every polygon in a placemark belongs to one zone (My Maps and Google Earth group several shapes this way)
    const polygons: PolygonRings[] = [];
    for (const poly of all(pm, "Polygon")) {
      const outer = parseRing(child(poly, "outerBoundaryIs"));
      if (!outer) continue;
      const holes = Array.from(poly.children)
        .filter((c) => c.localName === "innerBoundaryIs")
        .map(parseRing)
        .filter((h): h is Ring => h !== null);
      polygons.push([outer, ...holes]);
    }
    if (polygons.length) result.zones.push({ id: newId(), name, description, color, polygons });

    const lineStrings = all(pm, "LineString");
    for (const line of lineStrings) {
      const points = parsePoints(all(line, "coordinates")[0]?.textContent);
      if (points.length >= 2) result.lines.push({ id: newId(), name, points });
    }
    if (!polygons.length && !lineStrings.length && all(pm, "Point").length) result.skippedPoints++;
  }
  return result;
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;

/** Reads a .kml file, or a .kmz (a zipped KML, which is what My Maps exports by default). */
export function parseKmlBytes(bytes: Uint8Array): ParsedKml {
  if (!isZip(bytes)) return parseKML(strFromU8(bytes));
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, { filter: (f) => f.name.toLowerCase().endsWith(".kml") });
  } catch {
    throw new Error("the KMZ file is damaged");
  }
  // The main document is doc.kml by convention; otherwise take the first KML inside
  const names = Object.keys(files).sort((a, b) => Number(b.endsWith("doc.kml")) - Number(a.endsWith("doc.kml")));
  if (!names.length) throw new Error("the KMZ file has no KML inside");
  return parseKML(strFromU8(files[names[0]]));
}
