import { useMemo, useState } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import { DOT_ZOOM } from "./pinIcon";

/**
 * Whether the map is zoomed out past street level (below DOT_ZOOM), where stores are dots and Potentials smaller
 * diamonds. Only changes, and so only redraws the markers, when a zoom crosses that line.
 */
export function useZoomedOut(): boolean {
  const map = useMap();
  const [out, setOut] = useState(() => map.getZoom() < DOT_ZOOM);
  // The same handlers on every render: new ones are swapped in after a render, and a zoom made meanwhile (selecting a
  // store zooms in to it) would be missed
  const handlers = useMemo(() => ({ zoomend: () => setOut(map.getZoom() < DOT_ZOOM) }), [map]);
  useMapEvents(handlers);
  return out;
}
