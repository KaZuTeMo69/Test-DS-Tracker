import { lazy, memo, ReactNode, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, FileDown, FileUp, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CitySummary, SidebarTab, Store } from "../types";
import { COVERAGE_TAG, CURRENCY, RENEWAL_STYLE } from "../constants";
import { Filters } from "../hooks/useFilters";
import { dataIssues, hasCoords } from "../lib/checks";
import { Coverage, coverageFlags } from "../lib/coverage";
import { fmtN, fmtR } from "../lib/format";
import { storeRenewal } from "../lib/renewal";
import { isLive } from "../lib/status";

// The charts library is large and only the Growth tab uses it, so it loads when that tab first opens
const CityInsights = lazy(() => import("./CityInsights"));

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  stores: Store[];
  totalStores: number;
  citySummaries: CitySummary[];
  currentTab: SidebarTab;
  setCurrentTab: (tab: SidebarTab) => void;
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  onImportSheet: () => void;
  onCityFocus: (city: string) => void;
  filters: Filters;
  allCities: string[];
  emptyMessage: string; // shown when the list is empty
  coverage: Coverage; // for the coverage tags in the list
  insightsExtra: ReactNode; // shown above the charts in the Growth tab
  layersPanel: ReactNode; // the Layers tab
  layersSummary: string; // its footer
}

function downloadStoresCSV(stores: Store[]) {
  // Same columns as the Google Sheet, so an exported file can be imported again without losing fields
  const headers = [
    "Store Name",
    "City",
    "DS Code",
    "Contract Duration",
    "Paid / Not Paid",
    "Live / Not Live",
    "Contract Start Date",
    "Contract End Date",
    "Area (sqm.)",
    "Rent/sqm. (SAR)",
    "Annual Rent W/O VAT",
    "Lat",
    "Lng",
  ];
  const rows = stores.map((s) => [
    s.name,
    s.city,
    s.dsCode,
    s.contractDuration,
    s.paid,
    s.live,
    s.startDate,
    s.endDate,
    s.size,
    s.rentSARsqm,
    s.rentSARAnnual,
    s.lat,
    s.lng,
  ]);
  // Quote cells containing commas, quotes or line breaks
  const cell = (v: string | number | null | undefined) => {
    const text = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  // The BOM makes Excel read the file as UTF-8, so Arabic names survive
  const content = "\uFEFF" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dark_stores_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Long lists are drawn in batches as you scroll, so a sheet with thousands of stores doesn't slow the sidebar down
const LIST_BATCH = 100;

// One store in the list. Memoised, so selecting a store only redraws the two rows that changed
const StoreListItem = memo(function StoreListItem({
  store: s,
  selected,
  outside,
  inWhiteSpace,
  onSelect,
}: {
  store: Store;
  selected: boolean;
  outside: boolean; // not in any coverage zone
  inWhiteSpace: boolean;
  onSelect: (id: number) => void;
  key?: number;
}) {
  const renewal = storeRenewal(s);
  const issues = dataIssues(s);
  return (
    <div
      onClick={() => onSelect(s.id)}
      className={`store-list-item store-list-card bg-[#111] border border-[#222] p-[20px_21px] rounded-lg cursor-pointer transition-all hover:border-[#333] shadow-sm duration-300 ${selected ? "border-[#fbbf24]/50 bg-[#161616] ring-1 ring-[#fbbf24]/20 shadow-lg" : "opacity-80 hover:opacity-100"}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="store-title store-card-name text-sm font-bold text-white leading-snug mb-1 truncate">
            {s.name}
          </div>
          <div className="store-card-subtext text-[10px] font-mono text-gray-500 uppercase tracking-widest">
            {s.dsCode || "No DS code"} · {s.city}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end pt-0.5">
          <span
            className={`px-2 py-0.5 text-[9px] font-bold rounded-full ${isLive(s) ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}
          >
            {isLive(s) ? "LIVE" : "NOT LIVE"}
          </span>
          {renewal.status !== "unknown" && renewal.status !== "ok" && (
            <span
              className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${RENEWAL_STYLE[renewal.status].className}`}
              title={`Contract ends ${s.endDate}`}
            >
              {RENEWAL_STYLE[renewal.status].tag}
            </span>
          )}
          {!hasCoords(s) && (
            <span
              className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-[#FB923C]/10 text-[#FB923C]"
              title={s.locationIssue || "No coordinates"}
            >
              NO LOCATION
            </span>
          )}
          {outside && (
            <span
              className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${COVERAGE_TAG.outside.className}`}
              title="Not in any coverage zone on the map"
            >
              {COVERAGE_TAG.outside.short}
            </span>
          )}
          {inWhiteSpace && (
            <span
              className={`px-2 py-0.5 text-[9px] font-bold rounded-full border ${COVERAGE_TAG.whitespace.className}`}
              title="Inside a white-space zone on the map"
            >
              {COVERAGE_TAG.whitespace.short}
            </span>
          )}
          {hasCoords(s) && issues.length > 0 && (
            <span
              className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-[#FB923C]/10 text-[#FB923C]"
              title={issues.join("\n")}
            >
              CHECK DATA
            </span>
          )}
        </div>
      </div>
      <div className="store-card-footer-metrics mt-3 flex gap-4 text-[11px] font-mono text-gray-400">
        <span>{s.size || "—"} m²</span>
        <span>
          {CURRENCY} {fmtR(s.rentSARAnnual)}/yr
        </span>
      </div>
    </div>
  );
});

// Shows the next batch of stores when it scrolls into view. Keyed by the batch size, so it checks again after each batch
function LoadMore({ onVisible }: { onVisible: () => void; key?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onVisible();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);
  return (
    <div ref={ref} className="text-center py-3 text-[11px] text-gray-500">
      Loading more stores…
    </div>
  );
}

// A label with a row of three filter buttons, one of them active
function FilterRow<T extends string>({
  label,
  options,
  value,
  onChange,
  titles,
}: {
  label: string;
  options: [T, string][];
  value: T;
  onChange: (value: T) => void;
  titles?: Partial<Record<T, string>>;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-16 shrink-0 text-[10px] font-bold text-gray-500 uppercase tracking-widest">{label}</label>
      <div className="frow flex-1 grid grid-cols-3 gap-1 bg-black/20 p-0.5 rounded-lg">
        {options.map(([option, text]) => (
          <button
            key={option}
            onClick={() => onChange(option)}
            className={`fb ${value === option ? "on" : ""}`}
            title={titles?.[option]}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Sidebar({
  isOpen,
  onClose,
  stores,
  totalStores,
  citySummaries,
  currentTab,
  setCurrentTab,
  selectedId,
  onSelectStore,
  onImportSheet,
  onCityFocus,
  filters,
  allCities,
  emptyMessage,
  coverage,
  insightsExtra,
  layersPanel,
  layersSummary,
}: SidebarProps) {
  const {
    searchQuery,
    setSearchQuery,
    liveFilter,
    setLiveFilter,
    paidFilter,
    setPaidFilter,
    renewalFilter,
    setRenewalFilter,
    cityFilter,
    setCityFilter,
    unclearOnly,
    setUnclearOnly,
    coverageOnly,
    setCoverageOnly,
  } = filters;
  const [shown, setShown] = useState(LIST_BATCH);
  const showMore = useCallback(() => setShown((n) => n + LIST_BATCH), []);
  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ x: -350 }}
          animate={{ x: 0 }}
          exit={{ x: -350 }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          className="sidebar relative h-full flex-shrink-0 bg-[#0d0d0d]/85 backdrop-blur-md border border-[#262626] rounded-xl flex flex-col overflow-hidden z-[2000] shadow-2xl"
        >
          <div className="sb-top p-3 border-b border-[#262626] flex flex-col gap-2.5 ml-0 pl-[15px] pr-[15px]">
            <div className="flex items-center justify-between pl-[15px] pr-0">
              <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">Navigation</div>
              <div className="flex gap-2">
                <button
                  onClick={() => downloadStoresCSV(stores)}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-[#fbbf24] bg-white/5 rounded-full transition-colors"
                  title="Export to CSV"
                >
                  <FileUp size={16} />
                </button>
                <button
                  onClick={onImportSheet}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-[#fbbf24] bg-white/5 rounded-full transition-colors"
                  title="Import / Upload Data"
                >
                  <FileDown size={16} />
                </button>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center text-gray-500 hover:text-white bg-white/5 rounded-full transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
              </div>
            </div>
            <div className="tab-container">
              <button
                className={`tab-btn ${currentTab === "stores" ? "on" : ""}`}
                onClick={() => setCurrentTab("stores")}
              >
                🏪 Stores
              </button>
              <button
                className={`tab-btn ${currentTab === "cities" ? "on" : ""}`}
                onClick={() => setCurrentTab("cities")}
              >
                🏙 City
              </button>
              <button
                className={`tab-btn ${currentTab === "insights" ? "on" : ""}`}
                onClick={() => setCurrentTab("insights")}
              >
                📊 Growth
              </button>
              <button
                className={`tab-btn ${currentTab === "layers" ? "on" : ""}`}
                onClick={() => setCurrentTab("layers")}
              >
                🗺 Layers
              </button>
            </div>

            {currentTab === "stores" && (
              <div className="flex flex-col gap-2.5">
                {unclearOnly && (
                  <button
                    onClick={() => setUnclearOnly(false)}
                    className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-[#FB923C]/40 bg-[#FB923C]/10 text-[#FB923C] text-[10px] font-bold uppercase tracking-widest cursor-pointer hover:bg-[#FB923C]/15 transition-colors"
                    title="Show all stores again"
                  >
                    <span>Only stores with unclear status</span>
                    <X size={13} />
                  </button>
                )}
                {coverageOnly && (
                  <button
                    onClick={() => setCoverageOnly(null)}
                    className={`flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border text-[10px] font-bold uppercase tracking-widest cursor-pointer transition-colors ${COVERAGE_TAG[coverageOnly].className}`}
                    title="Show all stores again"
                  >
                    <span>
                      {coverageOnly === "outside" ? "Only stores outside coverage zones" : "Only stores in white space"}
                    </span>
                    <X size={13} />
                  </button>
                )}
                <div className="space-y-2">
                  <FilterRow
                    label="Live"
                    options={[
                      ["all", "All"],
                      ["live", "Live"],
                      ["notlive", "Not Live"],
                    ]}
                    value={liveFilter}
                    onChange={setLiveFilter}
                  />
                  <FilterRow
                    label="Payment"
                    options={[
                      ["all", "All"],
                      ["paid", "Paid"],
                      ["notpaid", "Unpaid"],
                    ]}
                    value={paidFilter}
                    onChange={setPaidFilter}
                  />
                  <FilterRow
                    label="Renewal"
                    options={[
                      ["all", "All"],
                      ["renew", "Renew"],
                      ["expired", "Expired"],
                    ]}
                    value={renewalFilter}
                    onChange={setRenewalFilter}
                    titles={{ renew: "Renewal due now or starting within 30 days, soonest first" }}
                  />
                  <div className="flex items-center gap-2">
                    <label className="w-16 shrink-0 text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                      City
                    </label>
                    <div className="sidebar-select-wrapper min-w-0">
                      <select
                        className="sidebar-select"
                        value={cityFilter}
                        onChange={(e) => setCityFilter(e.target.value)}
                      >
                        <option value="">ALL CITIES</option>
                        {allCities.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="sidebar-search-wrapper">
                  <Search className="sidebar-search-icon" size={15} />
                  <input
                    type="text"
                    placeholder="Search name, city, code..."
                    className="sidebar-search-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>

          <div
            className={`flex-1 overflow-y-auto pl-[15px] pr-[12px] pt-[15px] pb-5 space-y-3 scrollbar-thin scrollbar-thumb-[#262626] ${currentTab === "stores" ? "sb-list" : "city-list"}`}
          >
            {currentTab === "stores" ? (
              stores.length > 0 ? (
                <>
                  {stores.slice(0, shown).map((s) => {
                    const flags = coverageFlags(coverage, s);
                    return (
                      <StoreListItem
                        key={s.id}
                        store={s}
                        selected={selectedId === s.id}
                        outside={flags.outside}
                        inWhiteSpace={flags.inWhiteSpace}
                        onSelect={onSelectStore}
                      />
                    );
                  })}
                  {stores.length > shown && <LoadMore key={shown} onVisible={showMore} />}
                </>
              ) : (
                <div className="text-center py-10 text-[13px] text-gray-600 uppercase font-bold tracking-widest opacity-50">
                  {emptyMessage}
                </div>
              )
            ) : currentTab === "cities" ? (
              <div className="flex flex-col gap-4">
                {cityFilter && (
                  <button
                    onClick={() => {
                      setCityFilter("");
                      onCityFocus("");
                    }}
                    className="flex items-center gap-2 text-[#fbbf24] text-[10px] font-black uppercase mb-1 hover:opacity-80 transition-all cursor-pointer w-fit"
                  >
                    <ChevronLeft size={14} /> Back to All Cities
                  </button>
                )}

                {citySummaries.length > 0 ? (
                  citySummaries.map((c) => (
                    <div
                      key={c.city}
                      onClick={() => onCityFocus(c.city)}
                      className={`city-card bg-[#111] border p-4 rounded-lg shadow-sm transition-all cursor-pointer group ${cityFilter === c.city ? "border-[#fbbf24] bg-[#161616] ring-1 ring-[#fbbf24]/10" : "border-[#222] hover:border-[#fbbf24]/30"}`}
                    >
                      <div className="flex justify-between items-center mb-4">
                        <div
                          className={`city-card-title text-[14px] font-bold tracking-tight transition-colors ${cityFilter === c.city ? "text-[#fbbf24]" : "text-white group-hover:text-[#fbbf24]"}`}
                        >
                          {c.city}
                        </div>
                        <div
                          className={`city-card-count text-[10px] uppercase tracking-widest transition-all ${cityFilter === c.city ? "text-[#fbbf24]" : "text-gray-500 group-hover:text-[#fbbf24]"}`}
                        >
                          {c.count} {c.count !== 1 ? "STORES" : "STORE"}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-baseline text-[11px]">
                          <span className="city-card-label text-[10px] text-gray-500 uppercase font-bold">
                            Monthly Rent
                          </span>
                          <span className="city-card-value text-[#fbbf24] font-bold">
                            {CURRENCY} {c.annualRent > 0 ? fmtN(c.annualRent / 12) : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline text-[11px]">
                          <span className="city-card-label text-[10px] text-gray-500 uppercase font-bold">
                            Annual Rent
                          </span>
                          <span className="city-card-value text-white font-bold">
                            {CURRENCY} {c.annualRent > 0 ? fmtN(c.annualRent) : "—"}
                          </span>
                        </div>
                        <div className="flex justify-between items-baseline text-[11px]">
                          <span className="city-card-label text-[10px] text-gray-500 uppercase font-bold">
                            Live Status
                          </span>
                          <span className="city-card-value text-white font-bold">
                            {c.live} / {c.count}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-10 text-[13px] text-gray-600 uppercase font-bold tracking-widest opacity-50">
                    No city data
                  </div>
                )}
              </div>
            ) : currentTab === "layers" ? (
              layersPanel
            ) : (
              <>
                {insightsExtra}
                <Suspense fallback={<div className="text-center py-10 text-[11px] text-gray-500">Loading charts…</div>}>
                  <CityInsights citySummaries={citySummaries} />
                </Suspense>
              </>
            )}
          </div>

          <div className="p-2.5 text-center border-t border-[#262626] bg-[#0a0a0a]">
            <span className="text-[10px] text-gray-600 font-bold tracking-tight uppercase">
              {currentTab === "stores"
                ? `Showing ${stores.length} of ${totalStores} Stores`
                : currentTab === "layers"
                  ? layersSummary
                  : `${citySummaries.length} Cities Tracked`}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
