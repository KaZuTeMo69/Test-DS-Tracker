import { PolygonRings, Ring, ZoneLayer } from "../types";
import { hexToKmlColor, zoneColor } from "./layers";

// Written the way Google My Maps exports a layer, so My Maps (Import) and Google Earth read names,
// descriptions, shapes and colours back. My Maps turns one file into one layer, so each layer is one file.

const escapeXml = (text: string) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

// Twice the signed area in degrees: positive when the points run counter-clockwise
const signedArea = (ring: Ring) =>
  ring.reduce((sum, [lat, lng], i) => {
    const [lat2, lng2] = ring[(i + 1) % ring.length];
    return sum + (lng * lat2 - lng2 * lat);
  }, 0);

/** "lng,lat,0" points, closed by repeating the first; the KML standard wants outer boundaries counter-clockwise. */
function coordinates(ring: Ring, counterClockwise: boolean): string {
  const ordered = signedArea(ring) > 0 === counterClockwise ? ring : [...ring].reverse();
  return [...ordered, ordered[0]].map(([lat, lng]) => `${lng},${lat},0`).join(" ");
}

const boundary = (tag: "outerBoundaryIs" | "innerBoundaryIs", ring: Ring, ccw: boolean) =>
  `<${tag}><LinearRing><tessellate>1</tessellate><coordinates>${coordinates(ring, ccw)}</coordinates></LinearRing></${tag}>`;

const polygon = ([outer, ...holes]: PolygonRings) =>
  `<Polygon>${boundary("outerBoundaryIs", outer, true)}${holes.map((h) => boundary("innerBoundaryIs", h, false)).join("")}</Polygon>`;

const styleId = (hex: string) => `zone-${hex.replace("#", "").toUpperCase()}`;

/** The layer as a KML document. */
export function layerToKml(layer: ZoneLayer): string {
  const colors = [
    ...new Set([...layer.zones.map((z) => zoneColor(z, layer)), layer.color].map((c) => c.toUpperCase())),
  ];
  const styles = colors.map(
    (hex) =>
      `    <Style id="${styleId(hex)}"><LineStyle><color>${hexToKmlColor(hex)}</color><width>2</width></LineStyle>` +
      `<PolyStyle><color>${hexToKmlColor(hex, layer.opacity)}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>`,
  );
  const zones = layer.zones.map((zone) => {
    const shape =
      zone.polygons.length === 1
        ? polygon(zone.polygons[0])
        : `<MultiGeometry>${zone.polygons.map(polygon).join("")}</MultiGeometry>`;
    return [
      "    <Placemark>",
      `      <name>${escapeXml(zone.name)}</name>`,
      zone.description ? `      <description>${escapeXml(zone.description)}</description>` : "",
      `      <styleUrl>#${styleId(zoneColor(zone, layer))}</styleUrl>`,
      `      ${shape}`,
      "    </Placemark>",
    ]
      .filter(Boolean)
      .join("\n");
  });
  const lines = layer.lines.map(
    (line) =>
      `    <Placemark>\n      <name>${escapeXml(line.name)}</name>\n      <styleUrl>#${styleId(layer.color)}</styleUrl>\n` +
      `      <LineString><tessellate>1</tessellate><coordinates>${line.points.map(([lat, lng]) => `${lng},${lat},0`).join(" ")}</coordinates></LineString>\n    </Placemark>`,
  );
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Document>",
    `    <name>${escapeXml(layer.name)}</name>`,
    ...styles,
    ...zones,
    ...lines,
    "  </Document>",
    "</kml>",
    "",
  ].join("\n");
}

/** A file name for the layer that every system accepts. */
export const kmlFileName = (layer: ZoneLayer) => `${layer.name.replace(/[\\/:*?"<>|]+/g, "-").trim() || "layer"}.kml`;
