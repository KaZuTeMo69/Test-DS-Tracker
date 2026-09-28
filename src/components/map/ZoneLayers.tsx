import { Fragment, memo, useEffect, useMemo, useRef } from "react";
import { Polygon, Polyline, Tooltip } from "react-leaflet";
import L from "leaflet";
import { Zone, ZoneLayer } from "../../types";
import { zoneColor } from "../../lib/layers";

export interface ZoneRef {
  layerId: string;
  zoneId: string;
}

// One zone. Selected, its whole outline is drawn thicker, with a soft white halo around it, above other zones
const ZoneShape = memo(function ZoneShape({
  layer,
  zone,
  selected,
  onSelect,
}: {
  layer: ZoneLayer;
  zone: Zone;
  selected: boolean;
  onSelect: (layerId: string, zoneId: string) => void;
  key?: string;
}) {
  const ref = useRef<L.Polygon>(null);
  const color = zoneColor(zone, layer);
  const pathOptions = useMemo<L.PathOptions>(
    () => ({
      color,
      weight: selected ? 4 : 2,
      opacity: selected ? 1 : 0.85,
      fillColor: color,
      fillOpacity: selected ? Math.min(1, layer.opacity + 0.2) : layer.opacity,
    }),
    [color, selected, layer.opacity],
  );
  const eventHandlers = useMemo(() => ({ click: () => onSelect(layer.id, zone.id) }), [onSelect, layer.id, zone.id]);

  useEffect(() => {
    if (selected) ref.current?.bringToFront();
  }, [selected]);

  return (
    <>
      {selected && (
        <Polygon
          positions={zone.polygons}
          interactive={false}
          pathOptions={{ color: "#ffffff", weight: 10, opacity: 0.35, fill: false }}
        />
      )}
      {/* bubblingMouseEvents off: a click on a zone isn't also a click on the empty map, which would deselect */}
      <Polygon
        ref={ref}
        positions={zone.polygons}
        pathOptions={pathOptions}
        eventHandlers={eventHandlers}
        bubblingMouseEvents={false}
      >
        <Tooltip sticky className="zone-tooltip" opacity={1}>
          {zone.name || "Unnamed zone"}
        </Tooltip>
      </Polygon>
    </>
  );
});

/** The visible map layers: their zones, which can be selected, and any lines from the files. */
export default function ZoneLayers({
  layers,
  selected,
  onSelect,
}: {
  layers: ZoneLayer[];
  selected: ZoneRef | null;
  onSelect: (layerId: string, zoneId: string) => void;
}) {
  return (
    <>
      {layers
        .filter((layer) => layer.visible)
        .map((layer) => (
          <Fragment key={layer.id}>
            {layer.lines.map((line) => (
              <Polyline
                key={line.id}
                positions={line.points}
                interactive={false}
                pathOptions={{ color: layer.color, weight: 2, opacity: 0.8 }}
              />
            ))}
            {layer.zones.map((zone) => (
              <ZoneShape
                key={zone.id}
                layer={layer}
                zone={zone}
                selected={selected?.layerId === layer.id && selected.zoneId === zone.id}
                onSelect={onSelect}
              />
            ))}
          </Fragment>
        ))}
    </>
  );
}
