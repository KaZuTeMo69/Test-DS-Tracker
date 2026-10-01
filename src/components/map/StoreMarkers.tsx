import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import { Marker, Popup } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Store } from "../../types";
import { PIN_SEL } from "../../constants";
import { useSettings } from "../../hooks/useSettings";
import { hasCoords } from "../../lib/checks";
import { PinSize, RentBenchmark, RentBenchmarks } from "../../lib/rentStats";
import { isLive, isPaid } from "../../lib/status";
import { dotIcon, makeIcon, PinShape, pinShape, StoreIconOptions } from "./pinIcon";
import { OpdLevel } from "../../lib/cpo";
import { clusterDiameter, clusterSvg, clusterWords, RingPart } from "../../lib/clusterRing";
import { PinCategory, pinCategory } from "./pinCategories";
import { useZoomedOut } from "./useZoomedOut";

/** What the OPD and CPO pin colours need: each store's OPD quartile and CPO against its city's median. */
export interface OrderColours {
  opd: Map<number, OpdLevel>;
  cpo: Map<number, RentBenchmark>;
}

// The colour categories of a cluster's stores, read from their icons (so they're always what the pins show)
function clusterParts(cluster: L.MarkerCluster): RingPart[] {
  const parts = new Map<string, RingPart>();
  for (const m of cluster.getAllChildMarkers()) {
    const ring = (m.options.icon?.options as StoreIconOptions | undefined)?.ring;
    if (!ring) continue;
    const part = parts.get(ring.key);
    if (part) part.count++;
    else parts.set(ring.key, { ...ring, count: 1 });
  }
  return [...parts.values()];
}

// A donut: a dark disc with the count, ringed by the colours of the stores inside in their proportions
const clusterIcon = (cluster: L.MarkerCluster) => {
  const { html, size } = clusterSvg(clusterParts(cluster));
  return L.divIcon({ html, className: "store-cluster-icon", iconSize: L.point(size, size) });
};

// A cluster's mouse events carry the cluster as their layer
type ClusterEvent = L.LeafletMouseEvent & { layer?: L.MarkerCluster };

// The cluster radius by zoom: wide enough to group a city's stores when zoomed out; from district level (13) up,
// only stores at the same spot group, so each shows on its own and those spread out (spiderfy) when clicked
export const CLUSTER_ZOOM = 13;
const clusterRadius = (zoom: number) => (zoom >= CLUSTER_ZOOM ? 1 : zoom >= 11 ? 36 : 40);

// One pin with its popup. Memoised, so selecting a store or refreshing the data only redraws the pins that changed
const StoreMarker = memo(function StoreMarker({
  store: s,
  selected,
  category,
  shape,
  size,
  dot,
  popup,
  onSelect,
}: {
  store: Store;
  selected: boolean;
  category: PinCategory; // its colour, and what its cluster's ring shows for it
  shape: PinShape;
  size: PinSize;
  dot: boolean; // zoomed out: a small dot rather than the pin
  popup: boolean; // off while measuring: a click then snaps a measuring point to the store
  onSelect: (id: number) => void;
  key?: number;
}) {
  const eventHandlers = useMemo(() => ({ click: () => onSelect(s.id) }), [onSelect, s.id]);
  // The same position object while the store doesn't move: a new one makes the marker "move", and the cluster group
  // then takes it out and puts it back, which for every store at once (a new colour mode) takes seconds
  const position = useMemo((): [number, number] => [s.lat!, s.lng!], [s.lat, s.lng]);
  return (
    <Marker
      position={position}
      icon={
        dot
          ? dotIcon(category.color, shape, size, selected, category)
          : makeIcon(selected ? PIN_SEL : category.color, shape, size, selected, category)
      }
      eventHandlers={eventHandlers}
      zIndexOffset={selected ? 1000 : 0}
    >
      {popup && (
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
              <div className="map-popup-subtext text-[11px] text-gray-400 mt-1">
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
      )}
    </Marker>
  );
});

/**
 * The store pins. The shape shows the status, the size the annual rent, and the colour the status, rent per m² or CPO
 * against the city median, or OPD by quartile (chosen in the map controls). Zoomed out they're dots. Close together
 * they're grouped into clusters whose ring shows the mix of colours inside, unless clustering is switched off.
 */
export default function StoreMarkers({
  stores,
  benchmarks,
  orders,
  selectedId,
  onSelectStore,
  measuring = false,
}: {
  stores: Store[];
  benchmarks: RentBenchmarks;
  orders: OrderColours; // OPD quartiles and CPO against the city median, for those pin colours
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  measuring?: boolean;
}) {
  const { pinColors, rentFlagPercent, clusterStores } = useSettings();
  const zoomedOut = useZoomedOut();
  const placed = useMemo(() => stores.filter(hasCoords), [stores]);
  const categories = useMemo(
    () => new Map(placed.map((s) => [s.id, pinCategory(pinColors, s, benchmarks, orders, rentFlagPercent)])),
    [placed, pinColors, benchmarks, orders, rentFlagPercent],
  );

  // The clusters' rings follow the pins: redrawn once the pins have their new colours (a new colour mode, or new
  // medians). Stores added or removed by the filters redraw their own clusters
  const groupRef = useRef<L.MarkerClusterGroup | null>(null);
  useEffect(() => {
    groupRef.current?.refreshClusters();
  }, [categories]);

  // Hovering a cluster says its mix in words
  const onMouseOver = useCallback((e: ClusterEvent) => {
    const cluster = e.layer;
    if (!cluster?.getAllChildMarkers) return;
    cluster
      .bindTooltip(clusterWords(clusterParts(cluster)), {
        direction: "top",
        offset: [0, -clusterDiameter(cluster.getChildCount()) / 2],
        className: "cluster-tooltip",
      })
      .openTooltip();
  }, []);
  const onMouseOut = useCallback((e: ClusterEvent) => {
    e.layer?.unbindTooltip();
  }, []);

  const markers = placed.map((s) => (
    <StoreMarker
      key={s.id}
      store={s}
      selected={selectedId === s.id}
      category={categories.get(s.id)!}
      shape={pinShape(s)}
      size={benchmarks.sizeOf.get(s.id) ?? "s"}
      dot={zoomedOut}
      popup={!measuring}
      onSelect={onSelectStore}
    />
  ));

  if (!clusterStores) return <>{markers}</>;
  return (
    <MarkerClusterGroup
      ref={groupRef}
      chunkedLoading
      spiderfyOnMaxZoom={true}
      showCoverageOnHover={false}
      maxClusterRadius={clusterRadius}
      iconCreateFunction={clusterIcon}
      onMouseOver={onMouseOver as L.LeafletMouseEventHandlerFn}
      onMouseOut={onMouseOut as L.LeafletMouseEventHandlerFn}
    >
      {markers}
    </MarkerClusterGroup>
  );
}
