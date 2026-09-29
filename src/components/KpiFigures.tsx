import { CURRENCY } from "../constants";
import { useSettings } from "../hooks/useSettings";
import { fmtN } from "../lib/format";
import { KpiStats, missing } from "../lib/kpis";

/**
 * Monthly rent, total area and average rent per m²: kept out of the top bar to leave room for the map, and shown
 * in its popover and at the top of the City tab.
 */
export function ExtraFigures({ stats, className = "" }: { stats: KpiStats; className?: string }) {
  const { includeVat } = useSettings();
  const vat = includeVat ? " · incl. VAT" : "";
  const figures = [
    {
      key: "monthly",
      label: "Monthly rent",
      value: stats.totalRent > 0 ? fmtN(stats.totalRent / 12) : "—",
      unit: `${CURRENCY} / month${vat}`,
      note: missing(stats.noRent, "rent"),
      color: "#38BDF8",
    },
    {
      key: "area",
      label: "Total area",
      value: stats.totalArea > 0 ? fmtN(stats.totalArea) : "—",
      unit: "m²",
      note: missing(stats.noArea, "area"),
      color: "#ffffff",
    },
    {
      key: "avg",
      label: "Avg rent / m²",
      value: stats.avgRent > 0 ? Math.round(stats.avgRent).toLocaleString() : "—",
      unit: `${CURRENCY} / m²${vat}`,
      color: "#FECC00",
    },
  ];
  return (
    <div className={`extra-figures grid grid-cols-3 gap-2 ${className}`}>
      {figures.map((f) => (
        <div key={f.key} data-figure={f.key} className="extra-figure bg-white/[0.03] border border-white/10 rounded-lg">
          <div className="detail-panel-row-label text-[11px]">{f.label}</div>
          <div className="kpi-number text-[20px] font-bold leading-tight" style={{ color: f.color }}>
            {f.value}
          </div>
          <div className="text-[11px] text-gray-400 uppercase">{f.unit}</div>
          {f.note && <div className="text-[11px] text-[#FB923C]">{f.note}</div>}
        </div>
      ))}
    </div>
  );
}
