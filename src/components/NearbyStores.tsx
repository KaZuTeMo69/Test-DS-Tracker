import { useEffect, useState } from "react";
import { Route } from "lucide-react";
import { Store } from "../types";
import { LatLng } from "../lib/coords";
import { formatDrive, formatKm, googleMapsDirections, RoadService, SERVICE_NAME } from "../lib/roads";
import { byDriveTime, NearbyRow, useRoads } from "../hooks/useRoads";

interface NearbyState {
  rows: NearbyRow[];
  loading: boolean;
  service: RoadService | null;
}

/**
 * The 5 nearest live stores to a point: picked by straight-line distance here, then their road distances and drive
 * times in one request, listed by drive time (road km second) with the straight line beside it. Each row has a
 * link to Google Maps directions from that store to the point. Remembered for the visit.
 */
export default function NearbyStores({
  point,
  stores,
  excludeId,
  onSelect,
  compact = false,
  pointName = "here",
}: {
  point: LatLng;
  stores: Store[]; // all of them, whatever the filters
  excludeId?: number; // the store the point is
  onSelect?: (id: number) => void;
  compact?: boolean; // in a map popup
  pointName?: string; // what the point is, for the directions link's title
}) {
  const roads = useRoads();
  const [state, setState] = useState<NearbyState>({ rows: [], loading: true, service: null });
  const { lat, lng } = point;

  useEffect(() => {
    let current = true;
    const { near, answer } = roads.nearest({ lat, lng }, stores, excludeId);
    // The straight-line list shows at once; road figures fill in (straight away when remembered)
    setState({ rows: near.map((n) => ({ ...n, road: null })), loading: near.length > 0, service: null });
    answer.then((r) => current && setState({ rows: r.rows, loading: false, service: r.service }));
    return () => {
      current = false;
    };
  }, [lat, lng, stores, excludeId, roads]);

  if (!state.rows.length && !state.loading) {
    return <p className="nearby-empty">No other live stores with a location.</p>;
  }

  const rows = byDriveTime(state.rows);
  const via = state.service ? ` · via ${SERVICE_NAME[state.service].replace(/^the /, "")}` : "";
  return (
    <div className={`nearby ${compact ? "compact" : ""}`}>
      <ol className="nearby-list" aria-busy={state.loading}>
        {rows.map(({ store, air, road }) => (
          <li key={store.id} className="nearby-item">
            <button
              className="nearby-row"
              onClick={() => onSelect?.(store.id)}
              disabled={!onSelect}
              title={onSelect ? `Open ${store.name}` : undefined}
            >
              <span className="nearby-name">{store.name}</span>
              <span className="nearby-road">
                {road?.duration != null ? (
                  <>
                    <b>{formatDrive(road.duration)}</b>
                    {road.distance != null && <span> · {formatKm(road.distance)}</span>}
                  </>
                ) : road?.distance != null ? (
                  <b>{formatKm(road.distance)}</b>
                ) : state.loading ? (
                  <span className="nearby-wait">…</span>
                ) : (
                  <span className="nearby-none">{state.service ? "no road route" : "road distance unavailable"}</span>
                )}
              </span>
              <span className="nearby-air" title="Straight-line distance">
                {formatKm(air)}
                {compact ? "" : " straight"}
              </span>
            </button>
            <a
              className="nearby-route"
              href={googleMapsDirections({ lat: store.lat!, lng: store.lng! }, point)}
              target="_blank"
              rel="noopener noreferrer"
              title={`Directions from ${store.name} to ${pointName} in Google Maps`}
              aria-label={`Directions from ${store.name} in Google Maps`}
            >
              <Route size={14} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ol>
      <p className="nearby-foot">
        {state.loading
          ? "Working out drive times…"
          : state.service
            ? `${compact ? "By drive time" : `Nearest ${state.rows.length} live stores by drive time`}${via}`
            : "Straight-line distances only for now"}
        {compact ? " · " : ""}
        <span className="nearby-note">{compact ? "free-flow, no traffic" : "Free-flow drive time, no traffic"}</span>
      </p>
    </div>
  );
}
