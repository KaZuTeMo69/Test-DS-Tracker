import { useEffect, useRef } from "react";
import { Marker, Popup, useMap } from "react-leaflet";
import L from "leaflet";
import { LatLng } from "../../lib/coords";
import { makeIcon } from "./pinIcon";

interface SearchPinProps {
  pin: LatLng;
  onAddStore: () => void;
  onRemove: () => void;
}

/** The pin dropped by a coordinate search, with a popup to add a store there or remove the pin. */
export default function SearchPin({ pin, onAddStore, onRemove }: SearchPinProps) {
  const markerRef = useRef<L.Marker | null>(null);

  const map = useMap();

  // Open the popup once the map has moved to the pin. The map puts the pin in the middle of what's in view, so
  // the popup doesn't pan the map to fit (autoPan): that pan stopped the move to the pin halfway, and searching
  // the same point again after panning away left it off-centre
  useEffect(() => {
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

  return (
    <Marker position={[pin.lat, pin.lng]} icon={makeIcon("#FF5722", "round", "m", true)} ref={markerRef}>
      <Popup closeButton={false} maxWidth={280} autoPan={false}>
        <div className="map-popup-container p-4 flex flex-col gap-3 bg-[#111] rounded-xl text-white">
          <div className="text-center">
            <div className="text-xs font-black text-[#FF5722] uppercase tracking-wider mb-1 font-sans">
              Coordinates Found
            </div>
            <div className="font-mono text-xs text-gray-300 bg-white/5 py-1 px-2 rounded border border-white/5">
              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </div>
          </div>
          <div className="flex flex-col gap-2 mt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddStore();
              }}
              className="w-full bg-[#fbbf24] text-black border-none rounded-lg py-2.5 font-extrabold cursor-pointer hover:opacity-90 transform active:scale-95 transition-all text-[11px] uppercase tracking-wider"
            >
              Add Store to List ✚
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="w-full bg-red-400/10 hover:bg-red-400/20 text-red-400 border border-red-500/10 rounded-lg py-2 font-extrabold cursor-pointer transform active:scale-95 transition-all text-[11px] uppercase tracking-wider"
            >
              Remove Pin ✖
            </button>
          </div>
        </div>
      </Popup>
    </Marker>
  );
}
