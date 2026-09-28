import { memo, useMemo } from "react";
import { Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Store } from "../../types";
import { PIN_SEL } from "../../constants";
import { hasCoords } from "../../lib/checks";
import { isLive, isPaid } from "../../lib/status";
import { makeIcon, pinColor } from "./pinIcon";

const clusterIcon = (cluster: L.MarkerCluster) =>
  L.divIcon({
    html: `<div class="bg-[#fbbf24] text-black rounded-full w-8 h-8 flex items-center justify-center font-black border-2 border-black/20 shadow-[0_0_15px_rgba(251,191,36,0.3)]">${cluster.getChildCount()}</div>`,
    className: "custom-marker-cluster",
    iconSize: L.point(32, 32),
  });

// One pin with its popup. Memoised, so selecting a store or refreshing the data only redraws the pins that changed
const StoreMarker = memo(function StoreMarker({
  store: s,
  selected,
  onSelect,
}: {
  store: Store;
  selected: boolean;
  onSelect: (id: number) => void;
  key?: number;
}) {
  const eventHandlers = useMemo(() => ({ click: () => onSelect(s.id) }), [onSelect, s.id]);
  return (
    <Marker
      position={[s.lat!, s.lng!]}
      icon={makeIcon(selected ? PIN_SEL : pinColor(s), selected)}
      eventHandlers={eventHandlers}
      zIndexOffset={selected ? 1000 : 0}
    >
      <Popup closeButton={false} maxWidth={220}>
        <div className="map-popup-container p-4 flex flex-col gap-3 bg-[#111] rounded-xl">
          <div className="flex gap-2 text-center justify-center">
            <span
              className={`map-popup-tag-live px-2 py-0.5 rounded-md ${isLive(s) ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}
            >
              {isLive(s) ? "LIVE" : "NOT LIVE"}
            </span>
            <span
              className={`map-popup-tag-paid px-2 py-0.5 rounded-md ${isPaid(s) ? "bg-yellow-500/10 text-yellow-400" : "bg-orange-500/10 text-orange-400"}`}
            >
              {isPaid(s) ? "PAID" : "UNPAID"}
            </span>
          </div>
          <div className="text-center">
            <div className="map-popup-title text-sm font-extrabold text-white mb-0.5">{s.name}</div>
            <div className="map-popup-subtext text-[10px] text-gray-400 mt-1">
              {s.dsCode || "No DS code"} · {s.city}
            </div>
          </div>
          <button
            onClick={() => onSelect(s.id)}
            className="map-popup-btn w-full bg-[#fbbf24] text-black border-none rounded-lg py-2.5 font-extrabold cursor-pointer hover:opacity-90 shadow-md transform active:scale-95 transition-all"
          >
            View Details →
          </button>
        </div>
      </Popup>
    </Marker>
  );
});

/** The store pins, grouped into numbered clusters when they're close together. */
export default function StoreMarkers({
  stores,
  selectedId,
  onSelectStore,
}: {
  stores: Store[];
  selectedId: number | null;
  onSelectStore: (id: number) => void;
}) {
  return (
    <MarkerClusterGroup
      chunkedLoading
      spiderfyOnMaxZoom={true}
      showCoverageOnHover={false}
      iconCreateFunction={clusterIcon}
    >
      {stores.filter(hasCoords).map((s) => (
        <StoreMarker key={s.id} store={s} selected={selectedId === s.id} onSelect={onSelectStore} />
      ))}
    </MarkerClusterGroup>
  );
}
