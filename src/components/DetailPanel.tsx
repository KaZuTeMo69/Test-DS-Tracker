import { memo } from "react";
import { Store } from "../types";
import { isLive, isPaid, hasCoords, dataIssues, CURRENCY } from "../constants";
import { X, AlertCircle } from "lucide-react";

interface DetailPanelProps {
  store: Store | null;
  onClose: () => void;
}

const DetailPanel = memo(function DetailPanel({ store, onClose }: DetailPanelProps) {
  if (!store) return null;

  // Exact figures here; the rounded 274K style is for totals
  const sar = (n: number | null) => (n === null ? "—" : `${CURRENCY} ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);

  const issues = dataIssues(store);
  
  const detailRows = [
    { label: "City", value: store.city || "—" },
    { label: "DS Code", value: store.dsCode || "—" },
    { label: "Contract Duration", value: store.whCode || "—" },
    { label: "Contract Start", value: store.startDate || "—" },
    { label: "Area", value: store.size ? `${store.size} m²` : "—" },
    { label: "Rent / m²", value: sar(store.rentSARsqm) },
    { label: "Annual Rent", value: sar(store.rentSARAnnual), highlight: true },
    { label: "Monthly Rent", value: sar(store.rentSARMonthly), highlight: true },
  ];

  return (
    <div 
      onClick={(e) => e.stopPropagation()}
      className={`absolute top-[70px] right-[45px] ml-0 pl-[15px] pr-[15px] pt-[15px] pb-[12px] w-[300px] bg-[#111111]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col z-[500] transition-transform duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] translate-x-0`}
    >
      <div className="p-4 border-b border-[#262626] flex justify-between items-start">
        <div className="flex-1 mr-2 min-w-0">
          <h3 className="detail-panel-title text-md text-white leading-tight truncate">{store.name}</h3>
          <p className="detail-panel-subtext text-gray-500 mt-1">{store.dsCode || store.whCode} · {store.city}</p>
        </div>
        <button 
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-3 overflow-y-auto flex-1 scrollbar-hide">
        <div className="flex flex-wrap gap-2">
          <span className={`detail-panel-tag-live px-2.5 py-0.5 rounded-md ${isLive(store) ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
            {isLive(store) ? "LIVE" : "NOT LIVE"}
          </span>
          <span className={`detail-panel-tag-paid px-2.5 py-0.5 rounded-md ${isPaid(store) ? "bg-yellow-500/10 text-yellow-400" : "bg-orange-500/10 text-orange-400"}`}>
            {isPaid(store) ? "PAID CONTRACT" : "UNPAID"}
          </span>
        </div>

        {issues.length > 0 && (
          <div className="bg-[#FB923C]/10 border border-[#FB923C]/20 rounded-lg p-2.5 flex gap-2 items-start">
            <AlertCircle size={14} className="text-[#FB923C] flex-shrink-0 mt-0.5" />
            <div className="text-[10px] text-[#FB923C] leading-relaxed">
              <div className="font-bold uppercase tracking-wider mb-0.5">Check the source data</div>
              {issues.map((issue, i) => <div key={i}>{issue}</div>)}
            </div>
          </div>
        )}

        <div className="space-y-3 mt-2">
          {detailRows.map((row, i) => (
            <div key={i} className="flex justify-between border-b border-white/5 pb-1 items-baseline">
              <span className="detail-panel-row-label">{row.label.toUpperCase()}</span>
              <span className={row.highlight ? "detail-panel-row-value-highlight" : "detail-panel-row-value"}>
                {row.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 mt-auto">
        {hasCoords(store) ? (
          <a 
            href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`} 
            target="_blank" 
            rel="noopener noreferrer"
            className="detail-panel-maps-btn block w-full py-2.5 bg-[#fbbf24] text-black font-extrabold text-center rounded-lg transition-transform active:scale-95 no-underline shadow-lg"
          >
            📍 Open in Google Maps
          </a>
        ) : (
          <button 
            disabled 
            className="detail-panel-maps-btn block w-full py-2.5 bg-[#1a1a1a] text-gray-600 font-extrabold text-center rounded-lg cursor-not-allowed border border-[#333]"
          >
            No Maps link
          </button>
        )}
      </div>
    </div>
  );
});

export default DetailPanel;
