import L from "leaflet";

// KML stores points as "lng,lat[,alt]" separated by whitespace; Leaflet wants [lat, lng]
function parseCoordinates(text: string | null | undefined): [number, number][] {
  return (text || "")
    .trim()
    .split(/\s+/)
    .map((c) => {
      const p = c.split(",");
      return p.length >= 2 ? ([parseFloat(p[1]), parseFloat(p[0])] as [number, number]) : null;
    })
    .filter((c): c is [number, number] => c !== null);
}

export function parseKML(kmlText: string): L.Layer[] {
  const doc = new DOMParser().parseFromString(kmlText, "application/xml");
  const layers: L.Layer[] = [];

  doc.querySelectorAll("Placemark").forEach((pm) => {
    const name = pm.querySelector("name")?.textContent || "";

    // Polygons
    pm.querySelectorAll("Polygon").forEach((poly) => {
      const outer = poly.querySelector("outerBoundaryIs LinearRing coordinates");
      if (!outer) return;
      const coords = parseCoordinates(outer.textContent);

      if (coords.length >= 3) {
        const layer = L.polygon(coords, {
          color: "#FECC00",
          weight: 2,
          opacity: 0.85,
          fillColor: "#FECC00",
          fillOpacity: 0.08,
        });
        if (name) layer.bindTooltip(name, { permanent: false, direction: "center", opacity: 0.9 });
        layers.push(layer);
      }
    });

    // Lines
    pm.querySelectorAll("LineString coordinates").forEach((ls) => {
      const coords = parseCoordinates(ls.textContent);

      if (coords.length >= 2) {
        layers.push(L.polyline(coords, { color: "#FECC00", weight: 2, opacity: 0.7 }));
      }
    });
  });

  return layers;
}
