import { ChangeEvent, useRef } from "react";
import { Download, Eye, EyeOff, PenLine, Plus, Trash2, Upload } from "lucide-react";
import { LayerKind, ZoneLayer } from "../types";
import { LAYER_KIND_LABEL, zoneColor } from "../lib/layers";
import { ZoneRef } from "./map/ZoneLayers";
import ConfirmButton from "./ConfirmButton";

interface LayersPanelProps {
  layers: ZoneLayer[];
  canSave: boolean;
  selectedZone: ZoneRef | null;
  onImport: (files: File[]) => void;
  // delay: typing saves after a short pause, other changes save at once
  onUpdateLayer: (id: string, patch: Partial<Omit<ZoneLayer, "id">>, delay?: number) => void;
  onRemoveLayer: (id: string) => void;
  onClearAll: () => void;
  onSelectZone: (layerId: string, zoneId: string) => void;
  onAddLayer: (kind: LayerKind) => void;
  onDrawZone: (layerId: string) => void;
  onExport: (layer: ZoneLayer) => void;
}

const TYPING_DELAY = 400;

function LayerCard({
  layer,
  selectedZone,
  onUpdateLayer,
  onRemoveLayer,
  onSelectZone,
  onDrawZone,
  onExport,
}: Omit<LayersPanelProps, "layers" | "canSave" | "onImport" | "onClearAll" | "onAddLayer"> & {
  layer: ZoneLayer;
  key?: string;
}) {
  const update = (patch: Partial<Omit<ZoneLayer, "id">>, delay?: number) => onUpdateLayer(layer.id, patch, delay);
  const zoneWord = layer.zones.length === 1 ? "zone" : "zones";

  return (
    <div
      className={`layer-card bg-[#111] border rounded-lg ${layer.visible ? "border-[#2a2a2a]" : "border-[#1d1d1d] opacity-60"}`}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={() => update({ visible: !layer.visible })}
          className="w-7 h-7 shrink-0 flex items-center justify-center rounded-md text-gray-300 hover:text-white hover:bg-white/5"
          title={layer.visible ? "Hide this layer" : "Show this layer"}
        >
          {layer.visible ? <Eye size={15} /> : <EyeOff size={15} />}
        </button>
        <label className="zone-swatch shrink-0" style={{ background: layer.color }} title="Layer colour">
          <input
            type="color"
            value={layer.color.toLowerCase()}
            onChange={(e) => update({ color: e.target.value.toUpperCase() })}
          />
        </label>
        <input
          className="layer-name flex-1 min-w-0"
          value={layer.name}
          onChange={(e) => update({ name: e.target.value }, TYPING_DELAY)}
          aria-label="Layer name"
        />
      </div>

      <div className="flex items-center gap-2 layer-row">
        <div className="frow flex-1 grid grid-cols-2 gap-1">
          {(["coverage", "whitespace"] as LayerKind[]).map((kind) => (
            <button
              key={kind}
              onClick={() => update({ kind })}
              className={`fb ${layer.kind === kind ? "on" : ""}`}
              title={
                kind === "coverage"
                  ? "Zones your stores serve; used in the coverage checks"
                  : "Areas without coverage; drawn and measured, not counted as coverage"
              }
            >
              {LAYER_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 layer-row">
        <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest w-14 shrink-0">Fill</span>
        <input
          type="range"
          min={0}
          max={0.8}
          step={0.05}
          value={layer.opacity}
          onChange={(e) => update({ opacity: Number(e.target.value) }, TYPING_DELAY)}
          className="layer-opacity flex-1"
          aria-label="Fill opacity"
        />
        <span className="text-[11px] text-gray-300 font-mono w-9 text-right">{Math.round(layer.opacity * 100)}%</span>
      </div>

      <details className="layer-zones">
        <summary className="text-[11px] text-gray-300 cursor-pointer">
          {layer.zones.length} {zoneWord}
          {layer.lines.length ? ` · ${layer.lines.length} ${layer.lines.length === 1 ? "line" : "lines"}` : ""}
        </summary>
        <div className="flex flex-col layer-zone-list">
          {layer.zones.map((zone) => {
            const on = selectedZone?.layerId === layer.id && selectedZone.zoneId === zone.id;
            return (
              <button
                key={zone.id}
                onClick={() => onSelectZone(layer.id, zone.id)}
                className={`layer-zone flex items-center gap-2 text-left text-[12px] rounded-md ${on ? "on" : ""}`}
              >
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: zoneColor(zone, layer) }} />
                <span className="truncate">{zone.name || "Unnamed zone"}</span>
              </button>
            );
          })}
        </div>
      </details>

      <div className="flex items-center gap-1.5 layer-row">
        <button onClick={() => onDrawZone(layer.id)} className="layer-action" title="Draw a new zone in this layer">
          <PenLine size={13} /> Draw zone
        </button>
        <button
          onClick={() => onExport(layer)}
          disabled={!layer.zones.length && !layer.lines.length}
          className="layer-action"
          title="Download this layer as a KML file for Google My Maps or Google Earth"
        >
          <Download size={13} /> Export KML
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 layer-row">
        <span className="text-[11px] text-gray-400 truncate" title={layer.source || undefined}>
          {layer.source ? `From ${layer.source}` : "Made in the app"}
        </span>
        <ConfirmButton
          title="Delete this layer"
          label={<Trash2 size={13} />}
          confirmLabel="Delete layer?"
          onConfirm={() => onRemoveLayer(layer.id)}
          className="layer-delete shrink-0"
        />
      </div>
    </div>
  );
}

/** The Layers tab: KML / KMZ layers (coverage zones and white space) and their settings. */
export default function LayersPanel({
  layers,
  canSave,
  onImport,
  onClearAll,
  onAddLayer,
  ...cardProps
}: LayersPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // so the same file can be picked again
    if (files.length) onImport(files);
  };

  return (
    <div className="flex flex-col gap-3">
      <button
        onClick={() => fileRef.current?.click()}
        className="layer-import w-full bg-[#fbbf24] hover:bg-[#ffe169] text-black rounded-lg text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
      >
        <Upload size={14} /> Import KML / KMZ
      </button>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onAddLayer("whitespace")}
          className="layer-action justify-center"
          title="An empty layer for drawing white space"
        >
          <Plus size={13} /> White-space layer
        </button>
        <button
          onClick={() => onAddLayer("coverage")}
          className="layer-action justify-center"
          title="An empty layer for drawing coverage zones"
        >
          <Plus size={13} /> Coverage layer
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz"
        className="hidden"
        onChange={pick}
      />
      <p className="text-[11px] text-gray-400 leading-snug">
        In Google My Maps, use the map&apos;s ⋮ menu → <b className="text-gray-200">Export to KML/KMZ</b>, for the whole
        map or one layer. You can import several files at once, or start an empty layer and draw on the map.{" "}
        <b className="text-gray-200">Export KML</b> saves a layer as a file My Maps can import.
      </p>
      {!canSave && (
        <p className="text-[11px] text-[#FB923C] leading-snug">
          This browser can&apos;t save map layers, so they&apos;ll be gone when the page closes.
        </p>
      )}

      {layers.length === 0 ? (
        <div className="text-center py-8 text-[12px] text-gray-400">No map layers yet.</div>
      ) : (
        <>
          {layers.map((layer) => (
            <LayerCard key={layer.id} layer={layer} {...cardProps} />
          ))}
          <ConfirmButton
            label="Clear all layers"
            confirmLabel="Click again to remove every layer"
            onConfirm={onClearAll}
            className="layer-clear w-full text-[11px] font-bold uppercase tracking-wider rounded-lg"
          />
        </>
      )}
    </div>
  );
}
