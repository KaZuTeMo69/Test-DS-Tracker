// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { ZoneLayer } from "../types";
import { parseKML } from "./kml";
import { kmlFileName, layerToKml } from "./kmlExport";

const square = (lat: number, lng: number, size: number): [number, number][] => [
  [lat, lng],
  [lat, lng + size],
  [lat + size, lng + size],
  [lat + size, lng],
];

const layer: ZoneLayer = {
  id: "L",
  name: "White space <Riyadh> & North",
  kind: "whitespace",
  visible: true,
  color: "#E5E7EB",
  opacity: 0.3,
  source: "",
  created: 0,
  zones: [
    {
      id: "a",
      name: 'Gap "A" & more',
      description: "No store within 5 km\nCheck with growth <team>",
      color: "#F472B6",
      polygons: [[square(24.7, 46.6, 0.1), square(24.73, 46.63, 0.02)]], // with a hole
    },
    {
      id: "b",
      name: "Two parts",
      description: "",
      color: null,
      polygons: [[square(24.9, 46.9, 0.05)], [square(25, 47, 0.05)]],
    },
  ],
  lines: [
    {
      id: "l",
      name: "Ring road",
      points: [
        [24.7, 46.6],
        [24.8, 46.7],
      ],
    },
  ],
};

describe("layerToKml", () => {
  const kml = layerToKml(layer);

  it("reads back with the same names, descriptions, colours and shapes", () => {
    const back = parseKML(kml);
    expect(back.name).toBe(layer.name);
    expect(back.zones.map((z) => [z.name, z.description, z.color])).toEqual([
      ['Gap "A" & more', "No store within 5 km\nCheck with growth <team>", "#F472B6"],
      ["Two parts", "", "#E5E7EB"], // the layer's colour, written out
    ]);
    // The same points (the direction of each ring may be reversed for KML)
    const sorted = (ring: [number, number][]) => [...ring].map((p) => p.join()).sort();
    expect(back.zones[0].polygons[0].map(sorted)).toEqual(layer.zones[0].polygons[0].map(sorted));
    expect(back.zones[1].polygons).toHaveLength(2);
    expect(back.lines[0].points).toEqual(layer.lines[0].points);
  });

  it("closes each ring and runs outer boundaries counter-clockwise, holes clockwise", () => {
    const rings = [...kml.matchAll(/<(outer|inner)BoundaryIs>.*?<coordinates>(.*?)<\/coordinates>/g)].map((m) => ({
      kind: m[1],
      pts: m[2].split(" ").map((t) => t.split(",").map(Number)),
    }));
    for (const { kind, pts } of rings) {
      expect(pts[0]).toEqual(pts[pts.length - 1]);
      const area = pts
        .slice(0, -1)
        .reduce((s, [x, y], i, a) => s + x * a[(i + 1) % a.length][1] - a[(i + 1) % a.length][0] * y, 0);
      expect(area > 0).toBe(kind === "outer");
    }
  });

  it("writes the fill opacity into the style, as My Maps does", () => {
    expect(kml).toContain("<PolyStyle><color>4db672f4</color>"); // #F472B6 at 30%: alpha, blue, green, red
    expect(kml).toContain("<LineStyle><color>ffb672f4</color>");
  });

  it("escapes text so the file stays valid XML", () => {
    expect(kml).toContain("<name>White space &lt;Riyadh&gt; &amp; North</name>");
    expect(new DOMParser().parseFromString(kml, "application/xml").getElementsByTagName("parsererror")).toHaveLength(0);
  });
});

describe("kmlFileName", () => {
  it("removes characters that file systems don't allow", () => {
    expect(kmlFileName({ ...layer, name: 'Riyadh: north/south "v2"' })).toBe("Riyadh- north-south -v2-.kml");
    expect(kmlFileName({ ...layer, name: "  " })).toBe("layer.kml");
  });
});
