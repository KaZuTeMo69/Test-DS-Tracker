import { useEffect } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";

/** Puts a ready-made Leaflet layer (such as a KML shape) on the map while it's rendered. */
export default function RawLayer({ layer }: { layer: L.Layer; key?: string }) {
  const map = useMap();
  useEffect(() => {
    if (layer) {
      layer.addTo(map);
      return () => {
        layer.remove();
      };
    }
  }, [map, layer]);
  return null;
}
