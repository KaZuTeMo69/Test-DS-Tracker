import { ChangeEvent, RefObject, useRef } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { FileUp, Moon, Sun, X } from "lucide-react";
import { parseKML } from "../../lib/kml";

interface MapControlsProps {
  isNightMode: boolean;
  setIsNightMode: (night: boolean) => void;
  hasKml: boolean;
  onKmlLoaded: (layers: L.Layer[]) => void;
  onClearKml: () => void;
  // The route's directions panel is placed here, under the map buttons
  panelRef: RefObject<HTMLDivElement | null>;
}

/** The buttons down the right of the map: day/night tiles, load and clear a KML file, route directions. */
export default function MapControls({
  isNightMode,
  setIsNightMode,
  hasKml,
  onKmlLoaded,
  onClearKml,
  panelRef,
}: MapControlsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKmlUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const layers = parseKML(text);
        if (layers.length === 0) {
          alert("No usable polygons or lines found in KML");
          return;
        }
        onKmlLoaded(layers);
      } catch (err) {
        console.error("KML Parse error", err);
        alert("Failed to parse KML file");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset for next upload
  };

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
              fileInputRef.current?.click();
            }}
            className={`flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer ${hasKml ? "border-[#4ade80] text-[#4ade80]" : "text-[#EFEFEF] hover:bg-[#222]"}`}
            title="Load KML Area"
          >
            <FileUp size={18} />
          </button>

          {hasKml && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onClearKml();
              }}
              className="flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer text-[#f87171] hover:bg-[#222]"
              title="Clear KML"
            >
              <X size={18} />
            </button>
          )}

          {/* Clicks in the directions panel mustn't reach the map area, which would deselect the store */}
          <div ref={panelRef} className="flex flex-col items-end" onClick={(e) => e.stopPropagation()} />
        </div>
      </div>
      <input type="file" ref={fileInputRef} className="hidden" accept=".kml" onChange={handleKmlUpload} />
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
