import { useEffect, useState } from "react";
import { Store } from "../types";
import { LatLng } from "../lib/coords";
import { formatDrive, formatKm, RoadService, SERVICE_NAME } from "../lib/roads";
import { NearbyRow, useRoads } from "../hooks/useRoads";

interface NearbyState {
  rows: NearbyRow[];
  loading: boolean;
  service: RoadService | null;
}

// Sorted by drive time (free-flow, no traffic), then road distance; rows without a road answer go last
const byTime = (rows: NearbyRow[]) =>
  [...rows].sort(
    (a, b) =>
      (a.road?.duration ?? Infinity) - (b.road?.duration ?? Infinity) ||
      (a.road?.distance ?? Infinity) - (b.road?.distance ?? Infinity) ||
      a.air - b.air,
  );

/**
 * The 5 nearest live stores to a point: picked by straight-line distance here, then their road distances and drive
 * times in one request, listed by road distance (or drive time) with the straight line beside it. Remembered for
 * the visit.
 */
export default function NearbyStores({
  point,
  stores,
  excludeId,
  onSelect,
  compact = false,
  sort = "distance",
}: {
  point: LatLng;
  stores: Store[]; // all of them, whatever the filters
  excludeId?: number; // the store the point is
  onSelect?: (id: number) => void;
  compact?: boolean; // in a map popup
  sort?: "distance" | "time"; // by road distance, or by drive time then road distance
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

  const byDrive = sort === "time";
  const rows = byDrive ? byTime(state.rows) : state.rows;

  if (!state.rows.length && !state.loading) {
    return <p className="nearby-empty">No other live stores with a location.</p>;
  }

  return (
    <div className={`nearby ${compact ? "compact" : ""}`}>
      <ol className="nearby-list" aria-busy={state.loading}>
        {rows.map(({ store, air, road }) => (
          <li key={store.id}>
            <button
              className="nearby-row"
              onClick={() => onSelect?.(store.id)}
              disabled={!onSelect}
              title={onSelect ? `Open ${store.name}` : undefined}
            >
              <span className="nearby-name">{store.name}</span>
              <span className="nearby-road">
                {road?.distance != null ? (
                  byDrive && road.duration != null ? (
                    <>
                      <b>{formatDrive(road.duration)}</b>
                      <span> · {formatKm(road.distance)}</span>
                    </>
                  ) : (
                    <>
                      <b>{formatKm(road.distance)}</b>
                      {road.duration != null && <span> · {formatDrive(road.duration)}</span>}
                    </>
                  )
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
          </li>
        ))}
      </ol>
      <p className="nearby-foot">
        {state.loading
          ? "Working out road distances…"
          : state.service
            ? `${compact ? "By road" : `Nearest ${state.rows.length} live stores ${byDrive ? "by drive time" : "by road"}`} · via ${SERVICE_NAME[state.service].replace(/^the /, "")}`
            : "Straight-line distances only for now"}
        {byDrive && <span className="nearby-note">Free-flow drive time, no traffic</span>}
      </p>
    </div>
  );
}
