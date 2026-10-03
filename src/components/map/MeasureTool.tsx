import { useCallback, useEffect, useMemo, useState } from "react";
import { Marker, Polyline, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { ArrowLeftRight, ExternalLink, Ruler, X } from "lucide-react";
import { LatLng } from "../../lib/coords";
import {
  airDistance,
  formatDrive,
  formatKm,
  googleMapsDirections,
  isAbort,
  RoadRoute,
  RoadService,
  SERVICE_NAME,
} from "../../lib/roads";
import { useRoads } from "../../hooks/useRoads";

export interface MeasurePoint extends LatLng {
  label?: string; // the store or searched pin it was snapped to
}

type Measured =
  { status: "loading" } | { status: "done"; route: RoadRoute & { service: RoadService } } | { status: "failed" };

/**
 * Measuring: two points (clicked on the map, or snapped to a store or the searched pin), the road route between
 * them, and how it compares with the straight line. A third click starts again; points can be dragged.
 */
export function useMeasure() {
  const roads = useRoads();
  const [active, setActive] = useState(false);
  const [points, setPoints] = useState<MeasurePoint[]>([]);
  const [measured, setMeasured] = useState<Measured | null>(null);

  const add = useCallback((p: MeasurePoint) => setPoints((ps) => (ps.length >= 2 ? [p] : [...ps, p])), []);
  // A dragged point is wherever it was left, not the store it was snapped to
  const move = useCallback(
    (i: number, p: LatLng) => setPoints((ps) => ps.map((old, j) => (j === i ? { lat: p.lat, lng: p.lng } : old))),
    [],
  );
  const stop = useCallback(() => {
    setActive(false);
    setPoints([]);
    setMeasured(null);
  }, []);
  const toggle = useCallback(() => (active ? stop() : setActive(true)), [active, stop]);
  // A ↔ B: the route the other way round (one-way streets can make it different)
  const swap = useCallback(() => setPoints((ps) => (ps.length === 2 ? [ps[1], ps[0]] : ps)), []);

  // The road route once both points are down, again after each move; an answer for old points is dropped
  const [a, b] = points;
  useEffect(() => {
    if (!a || !b) {
      setMeasured(null);
      return;
    }
    const controller = new AbortController();
    setMeasured({ status: "loading" });
    roads
      .route(a, b, "Measured route", controller.signal)
      .then((route) => setMeasured(route ? { status: "done", route } : { status: "failed" }))
      .catch((e) => {
        if (!isAbort(e)) setMeasured({ status: "failed" });
      });
    return () => controller.abort();
  }, [a, b, roads]);

  // Esc stops measuring (and only that: preventDefault tells the page's own Esc handling it's been used)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      stop();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, stop]);

  return { active, points, measured, add, move, stop, toggle, swap };
}

export type Measure = ReturnType<typeof useMeasure>;

const pinIcon = (letter: string) =>
  L.divIcon({
    className: "measure-pin",
    html: `<span>${letter}</span>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
const ICONS = [pinIcon("A"), pinIcon("B")];

/** On the map: clicks place the points; the points, the road route and the straight line between them. */
export function MeasureLayer({ measure }: { measure: Measure }) {
  const { active, points, measured, add, move } = measure;
  useMapEvents({
    click: (e) => {
      if (active) add({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  const handlers = useMemo(
    () =>
      [0, 1].map((i) => ({
        dragend: (e: L.LeafletEvent) => move(i, (e.target as L.Marker).getLatLng()),
      })),
    [move],
  );
  if (!active) return null;
  return (
    <>
      {points.length === 2 && (
        <Polyline
          positions={points.map((p) => [p.lat, p.lng] as [number, number])}
          interactive={false}
          pathOptions={{ color: "#ffffff", weight: 2, opacity: 0.6, dashArray: "6 7" }}
        />
      )}
      {measured?.status === "done" && (
        <Polyline
          positions={measured.route.line}
          interactive={false}
          pathOptions={{ color: "#fbbf24", weight: 5, opacity: 0.9 }}
        />
      )}
      {points.map((p, i) => (
        <Marker
          key={i}
          position={[p.lat, p.lng]}
          icon={ICONS[i]}
          draggable
          eventHandlers={handlers[i]}
          zIndexOffset={2000}
          bubblingMouseEvents={false}
        >
          <Tooltip direction="top" offset={[0, -14]}>
            {p.label ?? "Drag to move"}
          </Tooltip>
        </Marker>
      ))}
    </>
  );
}

const name = (p: MeasurePoint) => p.label ?? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;

/** Across the top of the map while measuring: what to click next, then the road distance and drive time. */
export function MeasureBar({ measure }: { measure: Measure }) {
  const { points, measured, stop } = measure;
  const [a, b] = points;
  const air = a && b ? airDistance(a, b) : null;
  const road = measured?.status === "done" ? measured.route : null;
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- only keeps clicks inside from reaching the map; the controls inside are buttons
    <div
      className="measure-bar absolute left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto"
      role="status"
      aria-live="polite"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="measure-bar-head">
        <Ruler size={15} className="text-[#fbbf24] shrink-0" />
        <span className="measure-bar-title">Measure</span>
        <span className="measure-bar-step">
          {!a
            ? "Click the map, a store or the searched pin for point A"
            : !b
              ? `A: ${name(a)}. Now point B`
              : `${name(a)} → ${name(b)}`}
        </span>
        <button className="measure-bar-close" onClick={stop} title="Stop measuring (Esc)" aria-label="Stop measuring">
          <X size={15} />
        </button>
      </div>
      {a && b && (
        <div className="measure-bar-figures">
          <div className="measure-figure">
            <span className="measure-figure-label">By road</span>
            <span className="measure-figure-value">
              {road
                ? `${formatKm(road.distance)} · ${formatDrive(road.duration)}`
                : measured?.status === "failed"
                  ? "No route"
                  : "…"}
            </span>
          </div>
          <div className="measure-figure">
            <span className="measure-figure-label">Straight line</span>
            <span className="measure-figure-value">{formatKm(air!)}</span>
          </div>
          {road && air! > 0 && (
            <div className="measure-figure">
              <span className="measure-figure-label">Road ÷ straight</span>
              <span className="measure-figure-value">×{(road.distance / air!).toFixed(2)}</span>
            </div>
          )}
          <button
            className="measure-swap"
            onClick={measure.swap}
            title="Swap A and B: the route the other way"
            aria-label="Swap A and B"
          >
            <ArrowLeftRight size={13} /> A↔B
          </button>
          <a className="measure-maps-link" href={googleMapsDirections(a, b)} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={13} /> Google Maps
          </a>
        </div>
      )}
      {road && (
        <div className="measure-bar-via">
          via {SERVICE_NAME[road.service].replace(/^the /, "")} · drag A or B to adjust
        </div>
      )}
    </div>
  );
}
