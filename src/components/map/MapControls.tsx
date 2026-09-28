import { RefObject } from "react";
import { useMap } from "react-leaflet";
import { Layers, Moon, Sun } from "lucide-react";

interface MapControlsProps {
  isNightMode: boolean;
  setIsNightMode: (night: boolean) => void;
  hasLayers: boolean; // any map layer showing
  onOpenLayers: () => void;
  // The route's directions panel is placed here, under the map buttons
  panelRef: RefObject<HTMLDivElement | null>;
}

/** The buttons down the right of the map: day/night tiles, map layers, route directions. */
export default function MapControls({
  isNightMode,
  setIsNightMode,
  hasLayers,
  onOpenLayers,
  panelRef,
}: MapControlsProps) {
  return (
    <>
      <div className="leaflet-top leaflet-right mt-4 mr-4 !z-[1000] pointer-events-none">
        <div className="flex flex-col gap-2 items-end pointer-events-auto">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsNightMode(!isNightMode);
            }}
            className={`flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer ${!isNightMode ? "bg-[#fbbf24] text-black border-[#fbbf24]" : "text-[#EFEFEF] hover:bg-[#222]"}`}
            title={isNightMode ? "Switch to Day Map" : "Switch to Night Map"}
          >
            {isNightMode ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenLayers();
            }}
            className={`flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer ${hasLayers ? "border-[#4ade80] text-[#4ade80]" : "text-[#EFEFEF] hover:bg-[#222]"}`}
            title="Map layers (KML / KMZ)"
          >
            <Layers size={18} />
          </button>

          {/* Clicks in the directions panel mustn't reach the map area, which would deselect the store */}
          <div ref={panelRef} className="flex flex-col items-end" onClick={(e) => e.stopPropagation()} />
        </div>
      </div>
    </>
  );
}

/** Zoom in and out, bottom right of the map. */
export function ZoomButtons() {
  const map = useMap();
  return (
    <>
      <button
        className="bg-[#1e1e1e]/90 backdrop-blur-md border border-[#383838] hover:bg-[#252525] w-[40px] h-[40px] flex items-center justify-center text-[#EFEFEF] rounded-t-lg cursor-pointer text-xl font-bold"
        onClick={(e) => {
          e.stopPropagation();
          map.zoomIn();
        }}
        title="Zoom In"
      >
        +
      </button>
      <button
        className="bg-[#1e1e1e]/90 backdrop-blur-md border border-[#383838] border-t-0 hover:bg-[#252525] w-[40px] h-[40px] flex items-center justify-center text-[#EFEFEF] rounded-b-lg cursor-pointer text-xl font-bold"
        onClick={(e) => {
          e.stopPropagation();
          map.zoomOut();
        }}
        title="Zoom Out"
      >
        -
      </button>
    </>
  );
}
