import { useEffect, useMemo, useRef } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { Store } from "../../types";
import { LatLng } from "../../lib/coords";
import MapsButtons from "../MapsButtons";
import NearbyStores from "../NearbyStores";
import { makeIcon } from "./pinIcon";

interface SearchPinProps {
  pin: LatLng;
  stores: Store[]; // all of them, for the nearest ones
  measuring: boolean; // a click on the pin is then a measuring point
  onMeasurePoint: (point: LatLng & { label: string }) => void;
  onSelectStore: (id: number) => void;
  selectedId: number | null; // opening a store closes the popup (the route to it is drawn instead)
  onAddPotential: () => void;
  onRemove: () => void;
}

const ICON = makeIcon("#FF5722", "round", "m", true);

/**
 * The pin dropped by a coordinate search. Its popup has the nearest stores by drive time (each with directions from
 * it in Google Maps), the point in Google Maps and a link to share it, and adding a Potential there or removing the pin.
 */
export default function SearchPin({
  pin,
  stores,
  measuring,
  onMeasurePoint,
  onSelectStore,
  selectedId,
  onAddPotential,
  onRemove,
}: SearchPinProps) {
  const markerRef = useRef<L.Marker | null>(null);
  const map = useMap();

  // Open the popup once the map has moved to the pin. The map puts the pin in the middle of what's in view, so
  // the popup doesn't pan the map to fit (autoPan): that pan stopped the move to the pin halfway, and searching
  // the same point again after panning away left it off-centre
  // Only for a new pin, and not while measuring (the popup doesn't pop up again when measuring stops)
  const measuringRef = useRef(measuring);
  useEffect(() => {
    measuringRef.current = measuring;
  });
  useEffect(() => {
    if (measuringRef.current) return;
    const open = () => {
      clearTimeout(fallback);
      map.off("moveend", open);
      markerRef.current?.openPopup();
    };
    map.on("moveend", open);
    // When the map was already there, nothing moves
    const fallback = setTimeout(open, 450);
    return () => {
      clearTimeout(fallback);
      map.off("moveend", open);
    };
  }, [pin, map]);

  useEffect(() => {
    if (selectedId !== null) markerRef.current?.closePopup();
  }, [selectedId]);

  const eventHandlers = useMemo(
    () => ({
      click: () => {
        if (measuring) onMeasurePoint({ ...pin, label: "Searched point" });
      },
    }),
    [measuring, onMeasurePoint, pin],
  );

  return (
    <Marker position={[pin.lat, pin.lng]} icon={ICON} ref={markerRef} eventHandlers={eventHandlers}>
      {!measuring && (
        <Popup closeButton={false} maxWidth={310} minWidth={270} autoPan={false}>
          <div className="map-popup-container candidate-popup bg-[#111] rounded-xl text-white">
            <div className="candidate-head">
              <span className="candidate-title">Searched point</span>
              <span className="candidate-coords">
                {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </span>
            </div>

            <div className="candidate-section">
              <div className="candidate-label">Nearest live stores by drive time</div>
              <NearbyStores
                point={pin}
                stores={stores}
                onSelect={onSelectStore}
                compact
                pointName="the searched point"
              />
            </div>

            <MapsButtons point={pin} label="Searched point" className="popup" />

            <div className="candidate-actions">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  markerRef.current?.closePopup();
                  onAddPotential();
                }}
                className="candidate-btn primary"
              >
                Add potential
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove();
                }}
                className="candidate-btn danger"
              >
                Remove Pin
              </button>
            </div>
          </div>
        </Popup>
      )}
    </Marker>
  );
}
