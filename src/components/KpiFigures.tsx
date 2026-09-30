import { CURRENCY } from "../constants";
import { useSettings } from "../hooks/useSettings";
import { fmtN } from "../lib/format";
import { KpiStats, missing } from "../lib/kpis";
import { rentFactor } from "../lib/settings";

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
  const { due, overdue } = stats.payments;
  const { network } = stats;
  const factor = rentFactor(includeVat);
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
      {/* Orders: the total OPD, and the CPO weighted by orders (all the rent over all the orders) */}
      <div data-figure="opd" className="extra-figure bg-white/[0.03] border border-white/10 rounded-lg">
        <div className="detail-panel-row-label text-[11px]">Network OPD</div>
        <div className="kpi-number text-[20px] font-bold leading-tight text-white">
          {/* Exact up to 100K (it's compared with the ops reports), shortened above */}
          {!network.withOpd ? "—" : network.opd < 1e5 ? Math.round(network.opd).toLocaleString() : fmtN(network.opd)}
        </div>
        <div className="text-[11px] text-gray-400 uppercase">orders / day</div>
        {network.withOpd > 0 && network.withOpd < stats.total && (
          <div className="text-[11px] text-[#FB923C]">{stats.total - network.withOpd} without OPD</div>
        )}
      </div>
      <div
        data-figure="cpo"
        className="extra-figure col-span-2 bg-white/[0.03] border border-white/10 rounded-lg"
        title="Total annual rent / 360 / total OPD, over the stores with both an OPD and a rent"
      >
        <div className="detail-panel-row-label text-[11px]">Network CPO (weighted)</div>
        <div className="kpi-number text-[20px] font-bold leading-tight text-[#a78bfa]">
          {network.cpo === null ? "—" : (network.cpo * factor).toFixed(2)}
        </div>
        <div className="text-[11px] text-gray-400 uppercase">
          {CURRENCY} / order{vat}
        </div>
        <div className="text-[11px] text-gray-400">
          {network.included} of {stats.total} stores included (with an OPD and a rent)
        </div>
      </div>
      {/* Next payments from the contract register: due within 30 days, and past due */}
      <div
        data-figure="payments"
        className="extra-figure payments-figure col-span-3 bg-white/[0.03] border border-white/10 rounded-lg"
      >
        <div className="detail-panel-row-label text-[11px]">Payments due</div>
        <div className="payments-figure-values">
          <span className="kpi-number text-[20px] font-bold" style={{ color: due + overdue ? "#fbbf24" : "#ffffff" }}>
            {due + overdue}
          </span>
          <span className="text-[11px] text-gray-400 uppercase">
            {due} in the next 30 days ·{" "}
            <span className={overdue ? "text-red-400 font-bold" : ""}>{overdue} overdue</span>
          </span>
        </div>
      </div>
    </div>
  );
}
