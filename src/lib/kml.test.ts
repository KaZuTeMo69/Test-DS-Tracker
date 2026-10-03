// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { MAX_ZONE_FILE_BYTES, parseKML, parseKmlBytes, zoneFileProblem } from "./kml";

const kml = (body: string, head = "") =>
  `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Riyadh coverage</name>${head}${body}</Document></kml>`;

const polygon = (outer: string, holes: string[] = []) =>
  `<Polygon><outerBoundaryIs><LinearRing><coordinates>${outer}</coordinates></LinearRing></outerBoundaryIs>${holes
    .map((h) => `<innerBoundaryIs><LinearRing><coordinates>${h}</coordinates></LinearRing></innerBoundaryIs>`)
    .join("")}</Polygon>`;

const SQUARE = "46.60,24.70,0 46.70,24.70,0 46.70,24.80,0 46.60,24.80,0 46.60,24.70,0";
const HOLE = "46.64,24.74 46.66,24.74 46.66,24.76 46.64,24.76 46.64,24.74";

describe("parseKML", () => {
  it("reads a polygon with its name, as [lat, lng] points without the closing point", () => {
    const parsed = parseKML(kml(`<Placemark><name>Yasmin</name>${polygon(SQUARE)}</Placemark>`));
    expect(parsed.name).toBe("Riyadh coverage");
    expect(parsed.zones).toHaveLength(1);
    const [zone] = parsed.zones;
    expect(zone.name).toBe("Yasmin");
    expect(zone.polygons).toEqual([
      [
        [
          [24.7, 46.6],
          [24.7, 46.7],
          [24.8, 46.7],
          [24.8, 46.6],
        ],
      ],
    ]);
  });

  it("keeps holes", () => {
    const [zone] = parseKML(kml(`<Placemark>${polygon(SQUARE, [HOLE])}</Placemark>`)).zones;
    expect(zone.polygons[0]).toHaveLength(2);
    expect(zone.polygons[0][1][0]).toEqual([24.74, 46.64]);
  });

  it("treats the shapes of one placemark as one zone", () => {
    const other = "46.80,24.70 46.90,24.70 46.90,24.80";
    const [zone, ...rest] = parseKML(
      kml(
        `<Placemark><name>Two parts</name><MultiGeometry>${polygon(SQUARE)}${polygon(other)}</MultiGeometry></Placemark>`,
      ),
    ).zones;
    expect(rest).toHaveLength(0);
    expect(zone.polygons).toHaveLength(2);
  });

  it("turns an HTML description into plain text", () => {
    const [zone] = parseKML(
      kml(
        `<Placemark><description><![CDATA[Covered by <b>DS-101</b><br>Drawn by growth team<script>alert(1)</script>]]></description>${polygon(SQUARE)}</Placemark>`,
      ),
    ).zones;
    expect(zone.description).toBe("Covered by DS-101\nDrawn by growth team");
    expect(zone.description).not.toContain("<");
  });

  it("keeps a plain-text description as written, even with < or &", () => {
    const [zone] = parseKML(
      kml(
        `<Placemark><description>Check with &lt;growth team&gt; &amp; ops</description>${polygon(SQUARE)}</Placemark>`,
      ),
    ).zones;
    expect(zone.description).toBe("Check with <growth team> & ops");
  });

  it("reads the colour from a style, including a My Maps style map", () => {
    const head = `
      <Style id="poly-0288D1-normal"><LineStyle><color>ffd18802</color><width>1.2</width></LineStyle><PolyStyle><color>4cd18802</color></PolyStyle></Style>
      <Style id="poly-0288D1-highlight"><LineStyle><color>ffd18802</color></LineStyle></Style>
      <StyleMap id="poly-0288D1"><Pair><key>normal</key><styleUrl>#poly-0288D1-normal</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#poly-0288D1-highlight</styleUrl></Pair></StyleMap>`;
    const zones = parseKML(
      kml(
        `<Placemark><styleUrl>#poly-0288D1</styleUrl>${polygon(SQUARE)}</Placemark>
         <Placemark><Style><PolyStyle><color>ff0000ff</color></PolyStyle></Style>${polygon(SQUARE)}</Placemark>
         <Placemark>${polygon(SQUARE)}</Placemark>`,
        head,
      ),
    ).zones;
    expect(zones.map((z) => z.color)).toEqual(["#0288D1", "#FF0000", null]);
  });

  it("reads lines, counts markers, and skips shapes with too few points", () => {
    const parsed = parseKML(
      kml(`
        <Placemark><name>Route</name><LineString><coordinates>46.6,24.7 46.7,24.8</coordinates></LineString></Placemark>
        <Placemark><name>Pin</name><Point><coordinates>46.6,24.7</coordinates></Point></Placemark>
        <Placemark><name>Sliver</name>${polygon("46.6,24.7 46.7,24.7 46.6,24.7")}</Placemark>`),
    );
    expect(parsed.lines).toHaveLength(1);
    expect(parsed.lines[0].points).toEqual([
      [24.7, 46.6],
      [24.8, 46.7],
    ]);
    expect(parsed.skippedPoints).toBe(1);
    expect(parsed.zones).toHaveLength(0);
  });

  it("reads tags with a namespace prefix and inside folders", () => {
    const text = `<?xml version="1.0"?><kml:kml xmlns:kml="http://www.opengis.net/kml/2.2"><kml:Document><kml:Folder><kml:Placemark><kml:name>Prefixed</kml:name>${polygon(SQUARE).replace(/<(\/?)/g, "<$1kml:")}</kml:Placemark></kml:Folder></kml:Document></kml:kml>`;
    const [zone] = parseKML(text).zones;
    expect(zone.name).toBe("Prefixed");
    expect(zone.polygons[0][0]).toHaveLength(4);
  });

  it("rejects text that isn't KML", () => {
    expect(() => parseKML("not xml at all")).toThrow("it isn't a KML file");
    expect(() => parseKML("<html><body>hi</body></html>")).toThrow("it isn't a KML file");
  });
});

describe("parseKmlBytes", () => {
  const doc = kml(`<Placemark><name>Zipped</name>${polygon(SQUARE)}</Placemark>`);

  it("reads a plain KML file", () => {
    expect(parseKmlBytes(strToU8(doc)).zones[0].name).toBe("Zipped");
  });

  it("reads a KMZ, preferring doc.kml", () => {
    const kmz = zipSync({
      "images/icon.png": new Uint8Array([1, 2, 3]),
      "other.kml": strToU8(kml("")),
      "doc.kml": strToU8(doc),
    });
    expect(parseKmlBytes(kmz).zones[0].name).toBe("Zipped");
  });

  it("explains a KMZ without KML inside", () => {
    expect(() => parseKmlBytes(zipSync({ "readme.txt": strToU8("hi") }))).toThrow("no KML inside");
  });
});

describe("a file too large to read", () => {
  const doc = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Z</name>
    <Polygon><outerBoundaryIs><LinearRing><coordinates>46.6,24.7 46.7,24.7 46.7,24.8 46.6,24.7</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark></Document></kml>`;

  it("is refused by its size before it's opened (50 MB)", () => {
    expect(MAX_ZONE_FILE_BYTES).toBe(50 * 1024 * 1024);
    expect(zoneFileProblem(MAX_ZONE_FILE_BYTES + 1)).toBe("it's over 50 MB, too large to read");
    expect(zoneFileProblem(1024)).toBeNull();
    expect(() => parseKmlBytes(strToU8(doc), 100)).toThrow("too large to read");
  });

  it("a KMZ whose KML would unzip to more than the limit isn't unzipped", () => {
    const kmz = zipSync({ "doc.kml": strToU8(doc + " ".repeat(5000)) });
    expect(kmz.length).toBeLessThan(2000);
    expect(() => parseKmlBytes(kmz, 4000)).toThrow(/^the KML inside is over/);
    expect(parseKmlBytes(kmz).zones).toHaveLength(1);
  });
});
