import { RefObject, useContext, useEffect, useMemo, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Store } from "../../types";
import { LatLng } from "../../lib/coords";
import { clearRoute, RouteInfo, showRoute } from "../../lib/routing";
import { RoadsContext } from "../../hooks/useRoads";

/**
 * A request to show an area (a zone, or newly imported layers). A new id means a new request. The padding
 * keeps the area clear of the sidebar (left) and the card (right), which sit on top of the map.
 */
export interface ZoomRequest {
  id: number;
  bounds: [[number, number], [number, number]];
  padLeft: number;
  padRight: number;
  padBottom?: number; // on a phone, the sheet over the bottom of the map
}

// Leaflet ignores a new view while it's still animating a zoom (such as the first fit just after the page
// opens), so a view change asked for then waits for that zoom to end. Returns a cancel for effect clean-ups
function whenZoomEnds(map: L.Map, move: () => void): () => void {
  if (!(map as unknown as { _animatingZoom?: boolean })._animatingZoom) {
    move();
    return () => {};
  }
  map.once("zoomend", move);
  return () => map.off("zoomend", move);
}

/**
 * Keeps the map in step with the app: night tiles, fitting the view to the pins, the city or the searched
 * point, zooming to the selected store, and the route from the searched point to the selected store.
 */
export default function MapController({
  stores,
  selectedId,
  focusedCity,
  onMapClick,
  tempPin,
  routePanelRef,
  onRoute,
  zoomRequest,
  bottomInset = 0,
  leftInset = 0,
  layoutKey,
}: {
  stores: Store[];
  selectedId: number | null;
  focusedCity?: string | null;
  onMapClick?: () => void;
  tempPin: LatLng | null;
  routePanelRef: RefObject<HTMLDivElement | null>;
  onRoute?: (info: RouteInfo | null) => void; // the route's length and drive time, once known
  zoomRequest: ZoomRequest | null;
  bottomInset?: number; // the height of the sheet (store card or panels) over the bottom of the map
  leftInset?: number; // the width of the panel over the left of the map
  layoutKey?: string; // changes when the panels or bars around the map open or close
}) {
  const map = useMap();

  useMapEvents({
    click: () => {
      if (onMapClick) onMapClick();
    },
  });
  const storesWithCoords = useMemo(() => stores.filter((s) => s.lat !== null && s.lng !== null), [stores]);
  const pinsKey = useMemo(() => storesWithCoords.map((s) => `${s.id}:${s.lat},${s.lng}`).join("|"), [storesWithCoords]);
  // What the view was last fitted to. A background refresh hands over a new store list with the same pins,
  // and that mustn't throw away the user's current zoom and position
  const lastFitRef = useRef<{ pinsKey: string; focusedCity?: string | null; tempPin: LatLng | null } | null>(null);
  const selectedStore = selectedId === null ? undefined : stores.find((s) => s.id === selectedId);
  const selectedLat = selectedStore?.lat ?? null;
  const selectedLng = selectedStore?.lng ?? null;

  // Leaflet only measures its box when told to; without this, a map that grows (the top bar hidden in focus mode,
  // a window resized) is left with grey gaps where no tiles were loaded
  useEffect(() => {
    let frame = 0;
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize());
    });
    observer.observe(map.getContainer());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [map]);
  // And again once a panel or bar has finished sliding in or out
  useEffect(() => {
    map.invalidateSize();
    const timer = setTimeout(() => map.invalidateSize(), 350);
    return () => clearTimeout(timer);
  }, [map, layoutKey]);

  // What covers the map, for fitting areas into the part that's still visible. Read when fitting, so a panel
  // opening or closing doesn't move the map by itself
  const insetRef = useRef({ left: leftInset, bottom: bottomInset });
  useEffect(() => {
    insetRef.current = { left: leftInset, bottom: bottomInset };
  }, [leftInset, bottomInset]);
  const fitPadding = (pad: number) => ({
    paddingTopLeft: [pad + insetRef.current.left, pad] as L.PointTuple,
    paddingBottomRight: [pad, pad + insetRef.current.bottom] as L.PointTuple,
  });

  useEffect(() => {
    if (!map || !map.getContainer()) return;
    const last = lastFitRef.current;
    if (last && last.pinsKey === pinsKey && last.focusedCity === focusedCity && last.tempPin === tempPin) return;

    // Recorded when the fit happens, so a fit still waiting for a zoom to end isn't taken as done
    return whenZoomEnds(map, () => {
      lastFitRef.current = { pinsKey, focusedCity, tempPin };
      if (tempPin) {
        try {
          // In the middle of the part of the map the panel and sheets leave in view, a little low, so its
          // popup (the nearest stores) has room above it
          const { left, bottom } = insetRef.current;
          const pin = L.latLng(tempPin.lat, tempPin.lng);
          const popupRoom = Math.min(230, (map.getSize().y - bottom) * 0.28);
          const center = map.unproject(map.project(pin, 14).add([-left / 2, bottom / 2 - popupRoom]), 14);
          map.setView(center, 14, { animate: true });
        } catch (e) {
          console.warn("setView to tempPin failed", e);
        }
      } else if (focusedCity) {
        const cityStores = storesWithCoords.filter((s) => s.city === focusedCity);
        if (cityStores.length > 0) {
          try {
            const bounds = L.latLngBounds(cityStores.map((s) => [s.lat!, s.lng!]));
            map.fitBounds(bounds, fitPadding(80));
          } catch (e) {
            console.warn("fitBounds failed", e);
          }
        }
      } else if (storesWithCoords.length > 0) {
        try {
          const bounds = L.latLngBounds(storesWithCoords.map((s) => [s.lat!, s.lng!]));
          map.fitBounds(bounds, fitPadding(60));
        } catch (e) {
          console.warn("fitBounds failed", e);
        }
      }
    });
  }, [map, pinsKey, storesWithCoords, focusedCity, tempPin]);

  useEffect(() => {
    if (!map || !map.getContainer() || selectedLat === null || selectedLng === null) return;
    return whenZoomEnds(map, () => {
      try {
        // With a sheet over the bottom of the map (phones), the store goes in the middle of the part above it
        const zoom = Math.max(map.getZoom(), 14);
        const store = L.latLng(selectedLat, selectedLng);
        const center = bottomInset ? map.unproject(map.project(store, zoom).add([0, bottomInset / 2]), zoom) : store;
        map.setView(center, zoom, { animate: true });
      } catch (e) {
        console.warn("setView failed", e);
      }
    });
  }, [selectedId, map, selectedLat, selectedLng, bottomInset]);

  // Route from the searched coordinate to the selected store. It depends on the store's position, not the
  // store list, so a background refresh doesn't request the same route again
  // A new key in Settings draws the route again with it
  const roads = useContext(RoadsContext);
  const onRouteRef = useRef(onRoute);
  useEffect(() => {
    onRouteRef.current = onRoute;
  });
  useEffect(() => {
    if (tempPin && selectedLat !== null && selectedLng !== null) {
      showRoute(map, [tempPin.lat, tempPin.lng], [selectedLat, selectedLng], routePanelRef.current, roads, (info) =>
        onRouteRef.current?.(info),
      );
    } else {
      clearRoute(map);
    }
    onRouteRef.current?.(null);
  }, [map, tempPin, selectedLat, selectedLng, routePanelRef, roads]);

  useEffect(() => () => clearRoute(map), [map]);

  useEffect(() => {
    if (!zoomRequest) return;
    return whenZoomEnds(map, () => {
      try {
        map.fitBounds(zoomRequest.bounds, {
          paddingTopLeft: [zoomRequest.padLeft, 60],
          paddingBottomRight: [zoomRequest.padRight, zoomRequest.padBottom ?? 60],
          maxZoom: 15,
        });
      } catch (e) {
        console.warn("fitBounds failed", e);
      }
    });
  }, [map, zoomRequest]);

  return null;
}
