import { RefObject, useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import L from "leaflet";
import { Check, Group, Layers, Map as MapIcon, Maximize2, Moon, Palette, Ruler, Sun, Ungroup } from "lucide-react";
import { PIN_COLOR_MODES, PinColors } from "../../lib/settings";
import { BASE_MAP_ORDER, BASE_MAPS, BaseMapId } from "../../lib/baseMaps";

interface MapControlsProps {
  base: BaseMapId;
  onChooseBase: (base: BaseMapId) => void;
  onToggleNight: () => void;
  hasLayers: boolean; // any map layer showing
  onOpenLayers: () => void;
  pinColors: PinColors;
  onPinColors: (pinColors: PinColors) => void;
  clusterStores: boolean; // stores close together grouped into clusters
  onClusterStores: (on: boolean) => void;
  measuring: boolean;
  onMeasure: () => void; // starts measuring, or stops and clears it
  measureDisabled: boolean; // while a zone is being drawn or edited
  onFocusMode: () => void;
  // The route's directions panel is placed here, under the map buttons
  panelRef: RefObject<HTMLDivElement | null>;
}

const BTN =
  "flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer";
const IDLE = "text-[#EFEFEF] hover:bg-[#222]";
const LIT = "border-[#fbbf24] text-[#fbbf24]";

/**
 * Clicks on these controls mustn't also be clicks on the map (deselecting the store, or placing a measuring point).
 * Leaflet listens on its own container, before React sees the click, so it has to be told directly; and the map
 * area's own click (which closes the store card) is React's, so that's stopped too (`stopClick`).
 */
export function useNoMapClicks<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (!ref.current) return;
    L.DomEvent.disableClickPropagation(ref.current);
    L.DomEvent.disableScrollPropagation(ref.current);
  }, []);
  return ref;
}

export const stopClick = (e: { stopPropagation: () => void }) => e.stopPropagation();

/** The list of base maps, opened from its button: a swatch, the name and what it's for; the current one ticked. */
function BaseMapMenu({
  base,
  onChoose,
  onClose,
}: {
  base: BaseMapId;
  onChoose: (id: BaseMapId) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-base-map-button]"))
        onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="base-map-menu" role="menu" aria-label="Base map">
      <div className="base-map-menu-title">Base map</div>
      {BASE_MAP_ORDER.map((id) => {
        const map = BASE_MAPS[id];
        return (
          <button
            key={id}
            role="menuitemradio"
            aria-checked={base === id}
            data-base-map={id}
            className={`base-map-option ${base === id ? "on" : ""}`}
            onClick={() => {
              onChoose(id);
              onClose();
            }}
          >
            <span className="base-map-swatch" style={{ background: map.swatch }} aria-hidden="true" />
            <span className="flex flex-col items-start min-w-0">
              <span className="base-map-name">{map.name}</span>
              <span className="base-map-hint">{map.hint}</span>
            </span>
            {base === id && <Check size={15} className="ml-auto shrink-0 text-[#fbbf24]" />}
          </button>
        );
      })}
    </div>
  );
}

const PIN_MODE: Record<PinColors, { name: string; hint: string }> = {
  status: { name: "Status", hint: "Live · Paid, Live · Unpaid, Not live" },
  rent: { name: "Rent per m²", hint: "Against the city median" },
  opd: { name: "OPD", hint: "Orders per day, by quartile" },
  cpo: { name: "CPO", hint: "Cost per order, against the city median" },
};

/** The pin colour modes, opened from the palette button; the current one ticked. */
function PinColorMenu({
  mode,
  onChoose,
  onClose,
}: {
  mode: PinColors;
  onChoose: (mode: PinColors) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !(e.target as HTMLElement).closest?.("[data-pin-colors]"))
        onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div ref={ref} className="base-map-menu pin-color-menu" role="menu" aria-label="Pin colours">
      <div className="base-map-menu-title">Pin colours</div>
      {PIN_COLOR_MODES.map((id) => (
        <button
          key={id}
          role="menuitemradio"
          aria-checked={mode === id}
          data-pin-mode={id}
          className={`base-map-option ${mode === id ? "on" : ""}`}
          onClick={() => {
            onChoose(id);
            onClose();
          }}
        >
          <span className={`pin-mode-swatch ${id}`} aria-hidden="true" />
          <span className="flex flex-col items-start min-w-0">
            <span className="base-map-name">{PIN_MODE[id].name}</span>
            <span className="base-map-hint">{PIN_MODE[id].hint}</span>
          </span>
          {mode === id && <Check size={15} className="ml-auto shrink-0 text-[#fbbf24]" />}
        </button>
      ))}
    </div>
  );
}

/**
 * The buttons down the right of the map: day/night, the base map, pin colours, clustering on or off, map layers,
 * measuring and focus mode; then the drawn route's step-by-step directions.
 */
export default function MapControls({
  base,
  onChooseBase,
  onToggleNight,
  hasLayers,
  onOpenLayers,
  pinColors,
  onPinColors,
  clusterStores,
  onClusterStores,
  measuring,
  onMeasure,
  measureDisabled,
  onFocusMode,
  panelRef,
}: MapControlsProps) {
  const colored = pinColors !== "status";
  const night = base === "dark";
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorMenu, setColorMenu] = useState(false);
  const controlsRef = useNoMapClicks<HTMLDivElement>();
  return (
    <>
      <div className="map-controls leaflet-top leaflet-right mt-4 mr-4 !z-[1000] pointer-events-none">
        {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only keeps clicks inside from reaching the map; the controls inside are buttons */}
        <div ref={controlsRef} className="flex flex-col gap-2 items-end pointer-events-auto" onClick={stopClick}>
          <button
            onClick={onToggleNight}
            className={`${BTN} ${night ? IDLE : "bg-[#fbbf24] text-black border-[#fbbf24]"}`}
            title={night ? "Switch to Day Map" : "Switch to Night Map"}
          >
            {night ? <Moon size={18} /> : <Sun size={18} />}
          </button>

          <div className="relative">
            <button
              data-base-map-button
              onClick={() => setMenuOpen(!menuOpen)}
              className={`${BTN} ${menuOpen ? LIT : IDLE}`}
              title={`Base map: ${BASE_MAPS[base].name}`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MapIcon size={18} />
            </button>
            {menuOpen && <BaseMapMenu base={base} onChoose={onChooseBase} onClose={() => setMenuOpen(false)} />}
          </div>

          <div className="relative">
            <button
              onClick={() => setColorMenu(!colorMenu)}
              data-pin-colors={pinColors}
              aria-haspopup="menu"
              aria-expanded={colorMenu}
              className={`${BTN} ${colored || colorMenu ? LIT : IDLE}`}
              title={`Pin colours: ${PIN_MODE[pinColors].name}`}
            >
              <Palette size={18} />
            </button>
            {colorMenu && <PinColorMenu mode={pinColors} onChoose={onPinColors} onClose={() => setColorMenu(false)} />}
          </div>

          {/* Clustering is on by default, so the button is lit when it's off: every store shows on its own */}
          <button
            onClick={() => onClusterStores(!clusterStores)}
            aria-pressed={clusterStores}
            data-cluster-stores={clusterStores ? "on" : "off"}
            className={`${BTN} ${clusterStores ? IDLE : LIT}`}
            title={clusterStores ? "Clustering on: show every store on its own" : "Clustering off: group nearby stores"}
          >
            {clusterStores ? <Group size={18} /> : <Ungroup size={18} />}
          </button>

          <button
            onClick={onOpenLayers}
            className={`${BTN} ${hasLayers ? "border-[#4ade80] text-[#4ade80]" : IDLE}`}
            title="Map layers (KML / KMZ)"
          >
            <Layers size={18} />
          </button>

          <button
            onClick={onMeasure}
            disabled={measureDisabled && !measuring}
            aria-pressed={measuring}
            className={`measure-btn ${BTN} ${measuring ? LIT : IDLE} disabled:opacity-40 disabled:cursor-not-allowed`}
            title={measuring ? "Stop measuring (Esc)" : "Measure the road distance between two points"}
          >
            <Ruler size={18} />
          </button>

          <button onClick={onFocusMode} className={`focus-btn ${BTN} ${IDLE}`} title="Focus mode: only the map (F)">
            <Maximize2 size={17} />
          </button>

          {/* The route's step-by-step directions are moved in here */}
          <div ref={panelRef} className="flex flex-col items-end" />
        </div>
      </div>
    </>
  );
}

/** Zoom in and out, bottom right of the map: one control with a line between the two. */
export function ZoomButtons() {
  const map = useMap();
  const ref = useNoMapClicks<HTMLDivElement>();
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions -- only keeps clicks inside from reaching the map; the controls inside are buttons
    <div ref={ref} className="zoom-control" role="group" aria-label="Zoom" onClick={stopClick}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          map.zoomIn();
        }}
        title="Zoom In"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          map.zoomOut();
        }}
        title="Zoom Out"
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
}
