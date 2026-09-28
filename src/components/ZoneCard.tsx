import { X } from "lucide-react";
import { Zone, ZoneLayer } from "../types";
import { LAYER_KIND_LABEL, ZONE_COLORS, zoneAreaKm2, zoneColor } from "../lib/layers";

interface ZoneCardProps {
  layer: ZoneLayer;
  zone: Zone;
  // delay: typing saves after a short pause, other changes save at once
  onChange: (patch: Partial<Omit<Zone, "id">>, delay?: number) => void;
  onClose: () => void;
}

const TYPING_DELAY = 400;

const KIND_CHIP: Record<ZoneLayer["kind"], string> = {
  coverage: "bg-[#fbbf24]/10 text-[#fbbf24] border-[#fbbf24]/30",
  whitespace: "bg-white/10 text-gray-200 border-white/25",
};

const formatArea = (km2: number) => (km2 < 10 ? `${km2.toFixed(2)} km²` : `${Math.round(km2).toLocaleString()} km²`);

function shapeText(zone: Zone): string {
  const holes = zone.polygons.reduce((n, p) => n + p.length - 1, 0);
  const parts = zone.polygons.length > 1 ? `${zone.polygons.length} separate areas` : "1 area";
  return holes ? `${parts}, ${holes} ${holes === 1 ? "hole" : "holes"}` : parts;
}

// z-[600]: the same place and layer as the store card; only one of the two is open at a time
export default function ZoneCard({ layer, zone, onChange, onClose }: ZoneCardProps & { key?: string }) {
  const color = zoneColor(zone, layer);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="absolute top-[12px] right-[52px] max-h-[calc(100%-32px)] w-[340px] max-w-[calc(100%-64px)] bg-[#111111]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col z-[600]"
    >
      <div className="store-card-header border-b border-[#262626]">
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
          <span className={`text-[10px] font-bold store-card-chip rounded-full border ${KIND_CHIP[layer.kind]}`}>
            {LAYER_KIND_LABEL[layer.kind].toUpperCase()}
          </span>
          <span className="text-[10px] font-bold store-card-chip rounded-full border border-white/15 text-gray-300">
            {formatArea(zoneAreaKm2(zone))}
          </span>
        </div>
      </div>

      <div className="store-card-body flex flex-col gap-3 overflow-y-auto flex-1 min-h-0">
        <label className="flex flex-col gap-1">
          <span className="detail-panel-row-label text-[9.5px]">Name</span>
          <input
            className="zone-input"
            value={zone.name}
            placeholder="Unnamed zone"
            onChange={(e) => onChange({ name: e.target.value }, TYPING_DELAY)}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="detail-panel-row-label text-[9.5px]">Description</span>
          <textarea
            className="zone-input resize-none"
            rows={3}
            value={zone.description}
            placeholder="Notes for this zone"
            onChange={(e) => onChange({ description: e.target.value }, TYPING_DELAY)}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="detail-panel-row-label text-[9.5px]">Colour</span>
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
            <span className="detail-panel-row-label text-[10px] shrink-0">Area</span>
            <span className="detail-panel-row-value text-[12.5px] text-right">{formatArea(zoneAreaKm2(zone))}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-white/5 store-card-row items-baseline">
            <span className="detail-panel-row-label text-[10px] shrink-0">Shape</span>
            <span className="detail-panel-row-value text-[12.5px] text-right">{shapeText(zone)}</span>
          </div>
          <div className="flex justify-between gap-3 store-card-row items-baseline">
            <span className="detail-panel-row-label text-[10px] shrink-0">Layer</span>
            <span className="detail-panel-row-value text-[12.5px] text-right truncate">
              {layer.name} · {LAYER_KIND_LABEL[layer.kind]}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
