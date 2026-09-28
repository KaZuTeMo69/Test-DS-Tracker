import { RefObject, useEffect, useMemo, useRef } from "react";
import { useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Store } from "../../types";
import { LatLng } from "../../lib/coords";
import { clearRoute, showRoute } from "../../lib/routing";

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
  isNightMode,
  routePanelRef,
}: {
  stores: Store[];
  selectedId: number | null;
  focusedCity?: string | null;
  onMapClick?: () => void;
  tempPin: LatLng | null;
  isNightMode: boolean;
  routePanelRef: RefObject<HTMLDivElement | null>;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const tilePane = map.getPane("tilePane") || map.getContainer().querySelector(".leaflet-tile-pane");
    if (tilePane) {
      if (isNightMode) {
        tilePane.classList.add("night-map-tiles");
      } else {
        tilePane.classList.remove("night-map-tiles");
      }
    }
  }, [map, isNightMode]);

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

  useEffect(() => {
    // Small delay to ensure container is ready
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!map || !map.getContainer()) return;
    const last = lastFitRef.current;
    if (last && last.pinsKey === pinsKey && last.focusedCity === focusedCity && last.tempPin === tempPin) return;
    lastFitRef.current = { pinsKey, focusedCity, tempPin };

    if (tempPin) {
      try {
        map.setView([tempPin.lat, tempPin.lng], 14, { animate: true });
      } catch (e) {
        console.warn("setView to tempPin failed", e);
      }
    } else if (focusedCity) {
      const cityStores = storesWithCoords.filter((s) => s.city === focusedCity);
      if (cityStores.length > 0) {
        try {
          const bounds = L.latLngBounds(cityStores.map((s) => [s.lat!, s.lng!]));
          map.fitBounds(bounds, { padding: [80, 80] });
        } catch (e) {
          console.warn("fitBounds failed", e);
        }
      }
    } else if (storesWithCoords.length > 0) {
      try {
        const bounds = L.latLngBounds(storesWithCoords.map((s) => [s.lat!, s.lng!]));
        map.fitBounds(bounds, { padding: [60, 60] });
      } catch (e) {
        console.warn("fitBounds failed", e);
      }
    }
  }, [map, pinsKey, storesWithCoords, focusedCity, tempPin]);

  useEffect(() => {
    if (!map || !map.getContainer() || selectedLat === null || selectedLng === null) return;
    try {
      map.setView([selectedLat, selectedLng], Math.max(map.getZoom(), 14), { animate: true });
    } catch (e) {
      console.warn("setView failed", e);
    }
  }, [selectedId, map, selectedLat, selectedLng]);

  // Route from the searched coordinate to the selected store. It depends on the store's position, not the
  // store list, so a background refresh doesn't request the same route again
  useEffect(() => {
    if (tempPin && selectedLat !== null && selectedLng !== null) {
      showRoute(map, [tempPin.lat, tempPin.lng], [selectedLat, selectedLng], routePanelRef.current);
    } else {
      clearRoute(map);
    }
  }, [map, tempPin, selectedLat, selectedLng, routePanelRef]);

  useEffect(() => () => clearRoute(map), [map]);

  return null;
}
