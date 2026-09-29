import { RefObject, useEffect, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { PolygonRings } from "../../types";
import { geomanFor, loadGeoman, toPolygons } from "../../lib/geoman";

/** Drawing a new zone into a layer, or editing an existing zone's shape. */
export type MapMode =
  | { kind: "draw"; layerId: string; color: string }
  | { kind: "edit"; layerId: string; zoneId: string; color: string; polygons: PolygonRings[] };

/** What the banner's buttons do in the current mode. */
export interface EditorControls {
  finish: () => void;
  undo?: () => void; // drawing only: remove the last corner
}

interface ZoneEditorProps {
  mode: MapMode | null;
  controlsRef: RefObject<EditorControls | null>;
  onDrawn: (polygons: PolygonRings[]) => void;
  onEdited: (polygons: PolygonRings[]) => void;
  onCancel: () => void;
  onProblem: (message: string) => void;
}

// Geoman's own Finish and Undo toolbar buttons call these; they aren't in its type definitions
type DrawPolygon = { _finishShape: () => void; _removeLastVertex: () => void };

/** Runs Leaflet-Geoman for the current mode and hands the finished shape back. */
export default function ZoneEditor({ mode, controlsRef, onDrawn, onEdited, onCancel, onProblem }: ZoneEditorProps) {
  const map = useMap();
  // The effect below only restarts when the mode changes, so it reads the latest callbacks from here
  const handlers = useRef({ onDrawn, onEdited, onCancel, onProblem });
  useEffect(() => {
    handlers.current = { onDrawn, onEdited, onCancel, onProblem };
  });

  useEffect(() => {
    if (!mode) return;
    let active = true;
    let shape: L.Polygon | null = null;
    const container = map.getContainer();
    // While drawing or editing, clicks go to the drawing tool, not to store pins or other zones
    container.classList.add("zone-editing");

    const onCreate = (e: { layer: L.Layer }) => {
      const polygons = toPolygons((e.layer as L.Polygon).getLatLngs());
      e.layer.remove(); // the zone is drawn by the app from here on
      if (polygons.length) handlers.current.onDrawn(polygons);
      else handlers.current.onProblem("That shape needs at least 3 corners");
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault(); // used up here: the panel stays open
        handlers.current.onCancel();
      }
      if (e.key === "Enter") controlsRef.current?.finish();
    };
    document.addEventListener("keydown", onKey);

    loadGeoman()
      .then(() => {
        if (!active) return;
        const pm = geomanFor(map);
        pm.setGlobalOptions({ snappable: true, snapDistance: 15 });
        const style = { color: mode.color, fillColor: mode.color, fillOpacity: 0.25, weight: 3 };

        if (mode.kind === "draw") {
          pm.enableDraw("Polygon", {
            pathOptions: style,
            templineStyle: { color: mode.color },
            hintlineStyle: { color: mode.color, dashArray: [5, 5] },
            allowSelfIntersection: false,
            tooltips: false, // the banner explains the steps
          });
          map.on("pm:create", onCreate);
          const draw = pm.Draw as unknown as { Polygon: DrawPolygon };
          controlsRef.current = {
            finish: () => draw.Polygon._finishShape(),
            undo: () => draw.Polygon._removeLastVertex(),
          };
        } else {
          shape = L.polygon(mode.polygons, style).addTo(map);
          // A corner is removed with a right-click (a long press on phones). Removing on a plain click would
          // also remove the corner made by dragging a midpoint, as the drag ends with a click
          shape.pm.enable({ allowSelfIntersection: false });
          controlsRef.current = {
            finish: () => {
              if (!shape) return;
              if (shape.pm.hasSelfIntersection()) {
                handlers.current.onProblem("The edges cross each other. Move a corner so they don't");
                return;
              }
              const polygons = toPolygons(shape.getLatLngs());
              if (polygons.length) handlers.current.onEdited(polygons);
              else handlers.current.onProblem("The shape needs at least 3 corners");
            },
          };
        }
      })
      .catch(() => {
        if (!active) return;
        handlers.current.onProblem("Couldn't load the drawing tools. Check the connection and try again");
        handlers.current.onCancel();
      });

    return () => {
      active = false;
      container.classList.remove("zone-editing");
      document.removeEventListener("keydown", onKey);
      map.off("pm:create", onCreate);
      map.pm?.disableDraw();
      shape?.pm?.disable();
      shape?.remove();
      controlsRef.current = null;
    };
  }, [map, mode, controlsRef]);

  return null;
}
