import { useMemo, memo } from "react";
import { Store } from "../types";
import { isLive, isPaid, fmtN, getRent } from "../constants";

interface KPIBarProps {
  stores: Store[];
  currency: "USD" | "AED" | "SAR";
}

const KPIBar = memo(function KPIBar({ stores, currency }: KPIBarProps) {
  const stats = useMemo(() => {
    let live = 0;
    let paid = 0;
    let totalRent = 0;
    let totalArea = 0;
    let noRent = 0;
    let noArea = 0;
    // Rent per m² only uses stores that have both rent and area
    let pricedRent = 0;
    let pricedArea = 0;

    stores.forEach(s => {
      if (isLive(s)) live++;
      if (isPaid(s)) paid++;
      const rent = getRent(s, currency);
      if (rent === null) noRent++;
      totalRent += (rent || 0);
      if (!s.size) noArea++;
      totalArea += (s.size || 0);
      if (rent !== null && s.size) {
        pricedRent += rent;
        pricedArea += s.size;
      }
    });

    return {
      live,
      paid,
      totalRent,
      totalArea,
      noRent,
      noArea,
      avgRent: pricedArea > 0 ? pricedRent / pricedArea : 0
    };
  }, [stores, currency]);

  // Totals leave out stores with no value, so say how many were left out
  const missing = (n: number, what: string) => (n > 0 ? `${n} without ${what}` : undefined);

  const kpis: Array<{ label: string; value: string | number; unit?: string; note?: string; color: string; valueColor?: string; valueClass?: string }> = [
    { label: "Total Stores", value: stores.length, color: "#FECC00", valueColor: "#ffffff" },
    { label: "Live", value: stats.live, unit: stores.length ? `${Math.round(stats.live / stores.length * 100)}%` : "", color: "#22C55E", valueClass: "text-[#22C55E]" },
    { label: "Not Live", value: stores.length - stats.live, color: "#F43F5E", valueClass: "text-[#F43F5E]" },
    { label: "Unpaid Contracts", value: stores.length - stats.paid, color: "#FECC00", valueClass: "text-[#FECC00]" },
    { label: "Annual Rent", value: stats.totalRent > 0 ? fmtN(stats.totalRent) : "—", unit: `${currency} / year`, note: missing(stats.noRent, "rent"), color: "#FB923C", valueColor: "#ffffff" },
    { label: "Monthly Rent", value: stats.totalRent > 0 ? fmtN(stats.totalRent / 12) : "—", unit: `${currency} / month`, note: missing(stats.noRent, "rent"), color: "#38BDF8", valueClass: "text-[#38BDF8]" },
    { label: "Total Area", value: stats.totalArea > 0 ? fmtN(stats.totalArea) : "—", unit: "m²", note: missing(stats.noArea, "area"), color: "#666", valueColor: "#ffffff" },
    { label: "Avg Rent / m²", value: stats.avgRent > 0 ? Math.round(stats.avgRent).toLocaleString() : "—", unit: `${currency} / m²`, color: "#FB923C", valueClass: "text-[#FECC00]" },
  ];

  return (
    <div className="kpis-container flex gap-3 p-1.5 bg-[#0a0a0a] border border-[#222] rounded-xl shrink-0 overflow-x-auto scrollbar-hide">
      {kpis.map((kpi, i) => (
        <div 
          key={i} 
          className="kpi-card shrink-0 bg-[#111] border border-[#222] border-t-2 p-[10px_16px] sm:p-[13px_20px] rounded-xl shadow-sm transform transition-transform hover:scale-[1.02] text-center w-auto min-w-max"
          style={{ borderTopColor: kpi.color }}
        >
          <p className="kpi-label text-[10px] sm:text-[11px] font-bold text-gray-500 uppercase tracking-widest mb-1">{kpi.label}</p>
          <div className="flex flex-col items-center justify-center">
            <p className="kpi-value kpi-number text-2xl font-bold tracking-tight" style={{ color: kpi.valueColor || kpi.color }}>
              {kpi.value}
            </p>
            {kpi.unit ? (
              <p className="text-[10px] text-gray-500 uppercase mt-0.5">{kpi.unit}</p>
            ) : (
              <p className="text-[10px] opacity-0 select-none mt-0.5">—</p>
            )}
            {kpi.note && (
              <p className="text-[10px] text-[#FB923C] mt-0.5">{kpi.note}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});

export default KPIBar;
