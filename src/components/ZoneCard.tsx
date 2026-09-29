import { PenLine, Trash2, X } from "lucide-react";
import { Store, Zone, ZoneLayer } from "../types";
import { LAYER_KIND_LABEL, ZONE_COLORS, zoneAreaKm2, zoneColor } from "../lib/layers";
import { isLive } from "../lib/status";
import CardFrame from "./CardFrame";
import ConfirmButton from "./ConfirmButton";

interface ZoneCardProps {
  layer: ZoneLayer;
  zone: Zone;
  storesInside: Store[]; // stores with a location inside the zone, live or not
  onSelectStore: (id: number) => void;
  // delay: typing saves after a short pause, other changes save at once
  onChange: (patch: Partial<Omit<Zone, "id">>, delay?: number) => void;
  onClose: () => void;
  onEditShape: () => void;
  onDelete: () => void;
  onInset?: (px: number) => void; // on a phone: how much of the map the card covers
}

const TYPING_DELAY = 400;

const KIND_CHIP: Record<ZoneLayer["kind"], string> = {
  coverage: "bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/30",
  whitespace: "bg-white/10 text-gray-200 border-white/25",
};

// Long lists stop here; a zone this busy is better explored on the map
const STORE_LIST_LIMIT = 50;

const storeWord = (n: number) => `${n} ${n === 1 ? "STORE" : "STORES"}`;

// The chip that says how many stores are inside, and whether that needs a look
function storesChip(kind: ZoneLayer["kind"], n: number): { text: string; className: string } | null {
  if (kind === "whitespace")
    return n
      ? { text: `${storeWord(n)} INSIDE`, className: "bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/30" }
      : null;
  if (n === 0) return { text: "UNSERVED ZONE", className: "bg-red-500/10 text-red-400 border-red-500/30" };
  if (n === 1) return { text: storeWord(1), className: "bg-green-500/10 text-green-400 border-green-500/30" };
  return { text: `OVERLAP · ${storeWord(n)}`, className: "bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/30" };
}

const formatArea = (km2: number) => (km2 < 10 ? `${km2.toFixed(2)} km²` : `${Math.round(km2).toLocaleString()} km²`);

function shapeText(zone: Zone): string {
  const holes = zone.polygons.reduce((n, p) => n + p.length - 1, 0);
  const parts = zone.polygons.length > 1 ? `${zone.polygons.length} separate areas` : "1 area";
  return holes ? `${parts}, ${holes} ${holes === 1 ? "hole" : "holes"}` : parts;
}

// z-[600]: the same place and layer as the store card; only one of the two is open at a time
export default function ZoneCard({
  layer,
  zone,
  storesInside,
  onSelectStore,
  onChange,
  onClose,
  onEditShape,
  onDelete,
  onInset,
}: ZoneCardProps & { key?: string }) {
  const color = zoneColor(zone, layer);
  const chip = storesChip(layer.kind, storesInside.length);

  return (
    <CardFrame width={340} label={`Zone: ${zone.name || "Unnamed zone"}`} onClose={onClose} onInset={onInset}>
      <div className="store-card-header border-b border-[#262626]" data-sheet-header data-sheet-drag>
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0 flex items-start gap-2">
            <span className="w-3 h-3 rounded-sm shrink-0 zone-title-swatch" style={{ background: color }} />
            <div className="min-w-0">
              <h3 className="detail-panel-title text-[18px] text-white leading-tight truncate">
                {zone.name || "Unnamed zone"}
              </h3>
              <p className="detail-panel-subtext text-[11px] store-card-gap-top truncate">{layer.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 store-card-chips">
          <span className={`text-[11px] font-bold store-card-chip rounded-full border ${KIND_CHIP[layer.kind]}`}>
            {LAYER_KIND_LABEL[layer.kind].toUpperCase()}
          </span>
          <span className="text-[11px] font-bold store-card-chip rounded-full border border-white/15 text-gray-300">
            {formatArea(zoneAreaKm2(zone))}
          </span>
          {chip && (
            <span className={`text-[11px] font-bold store-card-chip rounded-full border ${chip.className}`}>
              {chip.text}
            </span>
          )}
        </div>
      </div>

      <div className="store-card-body flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
        <label className="flex flex-col gap-1">
          <span className="detail-panel-row-label text-[11px]">Name</span>
          <input
            className="zone-input"
            value={zone.name}
            placeholder="Unnamed zone"
            onChange={(e) => onChange({ name: e.target.value }, TYPING_DELAY)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="detail-panel-row-label text-[11px]">Description</span>
          <textarea
            className="zone-input resize-none"
            rows={3}
            value={zone.description}
            placeholder="Notes for this zone"
            onChange={(e) => onChange({ description: e.target.value }, TYPING_DELAY)}
          />
        </label>

        <div className="flex flex-col gap-1">
          <span className="detail-panel-row-label text-[11px]">Stores inside ({storesInside.length})</span>
          {storesInside.length === 0 ? (
            <div className="text-[11.5px] text-gray-400">
              {layer.kind === "coverage" ? "No store is inside this zone." : "No stores inside."}
            </div>
          ) : (
            <>
              {layer.kind === "whitespace" && (
                <div className="text-[11.5px] text-[#fbbf24] leading-snug">
                  {storesInside.length === 1 ? "This store is" : "These stores are"} inside an area marked as white
                  space.
                </div>
              )}
              {layer.kind === "coverage" && storesInside.length >= 2 && (
                <div className="text-[11.5px] text-[#fbbf24] leading-snug">
                  {storesInside.length} stores serve this zone.
                </div>
              )}
              <div className="flex flex-col">
                {storesInside.slice(0, STORE_LIST_LIMIT).map((store) => (
                  <button
                    key={store.id}
                    onClick={() => onSelectStore(store.id)}
                    className="layer-zone zone-store flex items-center gap-2 text-left rounded-md"
                    title="Open this store"
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${isLive(store) ? "bg-green-500" : "bg-red-500"}`}
                      title={isLive(store) ? "Live" : "Not live"}
                    />
                    <span className="text-[12px] font-bold truncate">{store.name}</span>
                    <span className="text-[11px] text-gray-400 font-mono ml-auto shrink-0">
                      {store.dsCode || "No DS code"}
                    </span>
                  </button>
                ))}
                {storesInside.length > STORE_LIST_LIMIT && (
                  <div className="text-[11px] text-gray-400 zone-store">
                    and {storesInside.length - STORE_LIST_LIMIT} more
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="detail-panel-row-label text-[11px]">Colour</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {ZONE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onChange({ color: c })}
                className={`zone-swatch ${zone.color?.toUpperCase() === c ? "on" : ""}`}
                style={{ background: c }}
                title={c}
              />
            ))}
            <label className="zone-swatch zone-swatch-custom" title="Pick any colour" style={{ background: color }}>
              <input
                type="color"
                value={color.toLowerCase()}
                onChange={(e) => onChange({ color: e.target.value.toUpperCase() })}
              />
              +
            </label>
          </div>
          <button
            onClick={() => onChange({ color: null })}
            className={`zone-layer-colour text-[11px] text-left ${zone.color === null ? "on" : ""}`}
          >
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: layer.color }} /> Same as the
            layer{zone.color === null ? " (current)" : ""}
          </button>
        </div>

        <div>
          <div className="flex justify-between gap-3 border-b border-white/5 store-card-row items-baseline">
            <span className="detail-panel-row-label text-[11px] shrink-0">Area</span>
            <span className="detail-panel-row-value text-[12.5px] text-right">{formatArea(zoneAreaKm2(zone))}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-white/5 store-card-row items-baseline">
            <span className="detail-panel-row-label text-[11px] shrink-0">Shape</span>
            <span className="detail-panel-row-value text-[12.5px] text-right">{shapeText(zone)}</span>
          </div>
          <div className="flex justify-between gap-3 store-card-row items-baseline">
            <span className="detail-panel-row-label text-[11px] shrink-0">Layer</span>
            <span className="detail-panel-row-value text-[12.5px] text-right truncate">
              {layer.name} · {LAYER_KIND_LABEL[layer.kind]}
            </span>
          </div>
        </div>
      </div>

      <div className="store-card-footer flex gap-2">
        <button onClick={onEditShape} className="zone-card-btn primary flex-1">
          <PenLine size={13} /> Edit shape
        </button>
        <ConfirmButton
          label={
            <>
              <Trash2 size={13} /> Delete zone
            </>
          }
          confirmLabel="Click again to delete"
          onConfirm={onDelete}
          className="zone-card-btn danger flex-1"
        />
      </div>
    </CardFrame>
  );
}
