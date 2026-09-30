import { memo, useMemo } from "react";
import { Marker, Tooltip, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { Potential, POTENTIAL_COLOR, POTENTIAL_STATUS_LABEL } from "../../lib/potentials";
import { potentialIcon } from "./pinIcon";

const PotentialMarker = memo(function PotentialMarker({
  potential: p,
  selected,
  onClick,
}: {
  potential: Potential;
  selected: boolean;
  onClick: (p: Potential) => void;
  key?: string;
}) {
  const handlers = useMemo(
    () => ({
      click: (e: L.LeafletMouseEvent) => {
        // Not also a click on the map, which would close the card this opens
        L.DomEvent.stopPropagation(e);
        onClick(p);
      },
    }),
    [onClick, p],
  );
  return (
    <Marker
      position={[p.lat, p.lng]}
      icon={potentialIcon(POTENTIAL_COLOR[p.status], { selected, light: p.status === "dropped" })}
      eventHandlers={handlers}
      zIndexOffset={selected ? 1100 : 500}
      keyboard
      title={`${p.name} (Potential, ${POTENTIAL_STATUS_LABEL[p.status]})`}
      alt={`Potential: ${p.name}`}
    >
      <Tooltip direction="top" offset={[0, -34]} className="potential-tooltip">
        <b>{p.name}</b> · {POTENTIAL_STATUS_LABEL[p.status]}
      </Tooltip>
    </Marker>
  );
});

/** The Potentials' diamond pins (not clustered, so they're never hidden in a store cluster). */
export default function PotentialMarkers({
  potentials,
  selectedId,
  onClick,
}: {
  potentials: Potential[];
  selectedId: string | null;
  onClick: (p: Potential) => void; // select it, or snap a measuring point to it
}) {
  return (
    <>
      {potentials.map((p) => (
        <PotentialMarker key={p.id} potential={p} selected={selectedId === p.id} onClick={onClick} />
      ))}
    </>
  );
}

/**
 * The pin of the Potential being added or edited: dragged to correct the spot, or moved by clicking the map.
 * While placing (before the form opens) a click on the map puts it down.
 */
export function PotentialFormPin({
  position,
  color,
  onMove,
}: {
  position: { lat: number; lng: number } | null;
  color: string;
  onMove: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (e) => onMove(e.latlng.lat, e.latlng.lng),
  });
  const handlers = useMemo(
    () => ({
      dragend: (e: L.DragEndEvent) => {
        const at = (e.target as L.Marker).getLatLng();
        onMove(at.lat, at.lng);
      },
    }),
    [onMove],
  );
  if (!position) return null;
  return (
    <Marker
      position={[position.lat, position.lng]}
      icon={potentialIcon(color, { moving: true })}
      draggable
      eventHandlers={handlers}
      zIndexOffset={2000}
      title="Drag to move the Potential"
    >
      <Tooltip direction="top" offset={[0, -42]} permanent className="potential-tooltip form-pin-tip">
        Drag to adjust
      </Tooltip>
    </Marker>
  );
}
