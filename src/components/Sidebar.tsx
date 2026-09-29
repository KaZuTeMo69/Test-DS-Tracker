import { lazy, memo, ReactNode, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, FileDown, FileUp, Search, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { CitySummary, SidebarTab, Store } from "../types";
import { COVERAGE_TAG, CURRENCY, HIGH_RENT_TAG, RENEWAL_STYLE } from "../constants";
import { Filters } from "../hooks/useFilters";
import { useSettings } from "../hooks/useSettings";
import { dataIssues, hasCoords } from "../lib/checks";
import { Coverage, coverageFlags } from "../lib/coverage";
import { IssueGroup } from "../lib/checks";
import { RentBenchmarks } from "../lib/rentStats";
import { fmtN, fmtR } from "../lib/format";
import { storeRenewal } from "../lib/renewal";
import { shownRent, vatLabel } from "../lib/settings";
import { isLive } from "../lib/status";
import DataQualityPanel from "./DataQualityPanel";
import LoadMore from "./LoadMore";
import { PANEL_TABS, PanelButton, panelTab, RailBadges } from "./NavRail";
import RenewalTimeline from "./RenewalTimeline";
import { ChartSkeleton, ListSkeleton } from "./Skeleton";

// The charts library is large and only the Growth tab uses it, so it loads when that tab first opens
const CityInsights = lazy(() => import("./CityInsights"));

interface SidebarProps {
  layout: "overlay" | "sheet"; // a column over the map on large screens, a sheet over its bottom on smaller ones
  isOpen: boolean;
  onOpen: () => void; // the sheet dragged up
  onClose: () => void;
  onSelectTab: (tab: SidebarTab) => void; // a panel icon: opens that panel, or closes it if it's the open one
  onInset: (px: number) => void; // how much of the bottom of the map the sheet covers (0 for the column)
  badges: RailBadges;
  stores: Store[];
  totalStores: number;
  citySummaries: CitySummary[];
  currentTab: SidebarTab;
  setCurrentTab: (tab: SidebarTab) => void;
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  onImportSheet: () => void;
  onExportCsv: () => void; // the stores that pass the filters
  onCityFocus: (city: string) => void;
  filters: Filters;
  allCities: string[];
  emptyMessage: string; // shown when the list is empty
  loading: boolean; // a saved Google Sheet is loading: placeholders instead of empty lists
  coverage: Coverage; // for the coverage tags in the list
  benchmarks: RentBenchmarks; // for the HIGH RENT tag
  quality: { groups: IssueGroup[]; storesWithIssues: number }; // the Data Quality panel
  insightsExtra: ReactNode; // shown above the charts in the Growth tab
  cityFigures: ReactNode; // shown above the city cards
  layersPanel: ReactNode; // the Layers tab
  layersSummary: string; // its footer
}

// Long lists are drawn in batches as you scroll, so a sheet with thousands of stores doesn't slow the sidebar down
const LIST_BATCH = 100;

// One store in the list. Memoised, so selecting a store only redraws the two rows that changed
const StoreListItem = memo(function StoreListItem({
  store: s,
  selected,
  outside,
  inWhiteSpace,
  highRentBy,
  onSelect,
}: {
  store: Store;
  selected: boolean;
  outside: boolean; // not in any coverage zone
  inWhiteSpace: boolean;
  highRentBy: number | null; // % above the city median, when flagged
  onSelect: (id: number) => void;
  key?: number;
}) {
  const settings = useSettings();
  const renewal = storeRenewal(s, settings);
  const issues = dataIssues(s);
  return (
    <div
      onClick={() => onSelect(s.id)}
      className={`store-list-item store-list-card bg-[#111] border border-[#222] p-[20px_21px] rounded-lg cursor-pointer transition-all hover:border-[#333] shadow-sm duration-300 ${selected ? "border-[#fbbf24]/50 bg-[#161616] ring-1 ring-[#fbbf24]/20 shadow-lg" : ""}`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="store-title store-card-name text-sm font-bold text-white leading-snug mb-1 truncate">
            {s.name}
          </div>
          <div className="store-card-subtext text-[11px] font-mono text-gray-400 uppercase tracking-widest">
            {s.dsCode || "No DS code"} · {s.city}
          </div>
        </div>
        <div className="flex flex-col gap-1 items-end pt-0.5">
          <span
            className={`px-2 py-0.5 text-[11px] font-bold rounded-full ${isLive(s) ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"}`}
          >
            {isLive(s) ? "LIVE" : "NOT LIVE"}
          </span>
          {renewal.status !== "unknown" && renewal.status !== "ok" && (
            <span
              className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${RENEWAL_STYLE[renewal.status].className}`}
              title={`Contract ends ${s.endDate}`}
            >
              {RENEWAL_STYLE[renewal.status].tag}
            </span>
          )}
          {!hasCoords(s) && (
            <span
              className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#FB923C]/10 text-[#FB923C]"
              title={s.locationIssue || "No coordinates"}
            >
              NO LOCATION
            </span>
          )}
          {highRentBy !== null && (
            <span
              className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${HIGH_RENT_TAG.className}`}
              title={`Rent per m² ${highRentBy}% above the ${s.city} median`}
            >
              {HIGH_RENT_TAG.tag}
            </span>
          )}
          {outside && (
            <span
              className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${COVERAGE_TAG.outside.className}`}
              title="Not in any coverage zone on the map"
            >
              {COVERAGE_TAG.outside.short}
            </span>
          )}
          {inWhiteSpace && (
            <span
              className={`px-2 py-0.5 text-[11px] font-bold rounded-full border ${COVERAGE_TAG.whitespace.className}`}
              title="Inside a white-space zone on the map"
            >
              {COVERAGE_TAG.whitespace.short}
            </span>
          )}
          {hasCoords(s) && issues.length > 0 && (
            <span
              className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[#FB923C]/10 text-[#FB923C]"
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
          {CURRENCY} {fmtR(shownRent(s.rentSARAnnual, settings))}/yr {vatLabel(settings)}
        </span>
      </div>
    </div>
  );
});

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
      <label className="w-16 shrink-0 text-[11px] font-bold text-gray-400 uppercase tracking-widest">{label}</label>
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

// The panel's content: its header, the Stores tab's filters, the list or chart for the tab, and the line at the foot
function usePanelParts(props: SidebarProps) {
  const {
    stores,
    totalStores,
    citySummaries,
    currentTab,
    setCurrentTab,
    selectedId,
    onSelectStore,
    onCityFocus,
    filters,
    allCities,
    emptyMessage,
    loading,
    coverage,
    benchmarks,
    quality,
    insightsExtra,
    cityFigures,
    layersPanel,
    layersSummary,
  } = props;
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
  const settings = useSettings();
  const [shown, setShown] = useState(LIST_BATCH);
  const showMore = useCallback(() => setShown((n) => n + LIST_BATCH), []);

  const actions = (
    <div className="flex gap-1.5 shrink-0">
      <button onClick={props.onExportCsv} className="panel-action" title="Export to CSV">
        <FileUp size={16} />
      </button>
      <button onClick={props.onImportSheet} className="panel-action" title="Import / Upload Data">
        <FileDown size={16} />
      </button>
      <button onClick={props.onClose} className="panel-action" title="Close panel (Esc)" aria-label="Close panel">
        <X size={17} />
      </button>
    </div>
  );
  const header = (
    <div className="panel-head flex items-center justify-between gap-2">
      <h2 className="panel-title">{panelTab(currentTab).title}</h2>
      {actions}
    </div>
  );

  const storeFilters = currentTab === "stores" && (
    <div className="panel-filters flex flex-col gap-2.5">
      {unclearOnly && (
        <button
          onClick={() => setUnclearOnly(false)}
          className="flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border border-[#FB923C]/40 bg-[#FB923C]/10 text-[#FB923C] text-[11px] font-bold uppercase tracking-widest cursor-pointer hover:bg-[#FB923C]/15 transition-colors"
          title="Show all stores again"
        >
          <span>Only stores with unclear status</span>
          <X size={13} />
        </button>
      )}
      {coverageOnly && (
        <button
          onClick={() => setCoverageOnly(null)}
          className={`flex items-center justify-between gap-2 w-full px-3 py-2 rounded-lg border text-[11px] font-bold uppercase tracking-widest cursor-pointer transition-colors ${COVERAGE_TAG[coverageOnly].className}`}
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
          titles={{
            renew: `Renewal due now or starting within ${settings.warningDays} days, soonest first`,
          }}
        />
        <div className="flex items-center gap-2">
          <label className="w-16 shrink-0 text-[11px] font-bold text-gray-400 uppercase tracking-widest">City</label>
          <div className="sidebar-select-wrapper min-w-0">
            <select className="sidebar-select" value={cityFilter} onChange={(e) => setCityFilter(e.target.value)}>
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
  );

  const content =
    loading && currentTab !== "layers" ? (
      currentTab === "insights" ? (
        <ChartSkeleton label="Loading your stores from the Google Sheet" />
      ) : (
        <ListSkeleton rows={currentTab === "cities" ? 4 : 6} label="Loading your stores from the Google Sheet" />
      )
    ) : currentTab === "stores" ? (
      stores.length > 0 ? (
        <>
          {stores.slice(0, shown).map((s) => {
            const flags = coverageFlags(coverage, s);
            const rent = benchmarks.of.get(s.id);
            return (
              <StoreListItem
                key={s.id}
                store={s}
                selected={selectedId === s.id}
                outside={flags.outside}
                inWhiteSpace={flags.inWhiteSpace}
                highRentBy={rent?.level === "high" ? rent.diff : null}
                onSelect={onSelectStore}
              />
            );
          })}
          {stores.length > shown && <LoadMore key={shown} onVisible={showMore} />}
        </>
      ) : (
        <div className="text-center py-10 text-[13px] text-gray-400 uppercase font-bold tracking-widest">
          {emptyMessage}
        </div>
      )
    ) : currentTab === "cities" ? (
      <div className="flex flex-col gap-4">
        {cityFigures}
        {cityFilter && (
          <button
            onClick={() => {
              setCityFilter("");
              onCityFocus("");
            }}
            className="flex items-center gap-2 text-[#fbbf24] text-[11px] font-black uppercase mb-1 hover:opacity-80 transition-all cursor-pointer w-fit"
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
                  className={`city-card-count text-[11px] uppercase tracking-widest transition-all ${cityFilter === c.city ? "text-[#fbbf24]" : "text-gray-400 group-hover:text-[#fbbf24]"}`}
                >
                  {c.count} {c.count !== 1 ? "STORES" : "STORE"}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-baseline text-[11px]">
                  <span className="city-card-label text-[11px] text-gray-400 uppercase font-bold">
                    Monthly Rent {vatLabel(settings)}
                  </span>
                  <span className="city-card-value text-[#fbbf24] font-bold">
                    {CURRENCY} {c.annualRent > 0 ? fmtN(c.annualRent / 12) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-[11px]">
                  <span className="city-card-label text-[11px] text-gray-400 uppercase font-bold">
                    Annual Rent {vatLabel(settings)}
                  </span>
                  <span className="city-card-value text-white font-bold">
                    {CURRENCY} {c.annualRent > 0 ? fmtN(c.annualRent) : "—"}
                  </span>
                </div>
                <div className="flex justify-between items-baseline text-[11px]">
                  <span className="city-card-label text-[11px] text-gray-400 uppercase font-bold">Live Status</span>
                  <span className="city-card-value text-white font-bold">
                    {c.live} / {c.count}
                  </span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-10 text-[13px] text-gray-400 uppercase font-bold tracking-widest">
            No city data
          </div>
        )}
      </div>
    ) : currentTab === "layers" ? (
      layersPanel
    ) : currentTab === "quality" ? (
      <DataQualityPanel
        groups={quality.groups}
        storesWithIssues={quality.storesWithIssues}
        totalStores={totalStores}
        selectedId={selectedId}
        onSelectStore={onSelectStore}
        onBack={() => setCurrentTab("stores")}
      />
    ) : currentTab === "renewals" ? (
      <RenewalTimeline
        stores={stores}
        totalStores={totalStores}
        selectedId={selectedId}
        onSelectStore={onSelectStore}
      />
    ) : (
      <>
        {insightsExtra}
        <Suspense fallback={<ChartSkeleton />}>
          <CityInsights citySummaries={citySummaries} />
        </Suspense>
      </>
    );

  const footer =
    loading && currentTab !== "layers"
      ? "Loading your stores…"
      : currentTab === "stores"
        ? `Showing ${stores.length} of ${totalStores} Stores`
        : currentTab === "layers"
          ? layersSummary
          : currentTab === "renewals"
            ? `Next 12 months · ${settings.leadDays}-day lead`
            : currentTab === "quality"
              ? `${quality.storesWithIssues} of ${totalStores} stores to check`
              : `${citySummaries.length} Cities Tracked`;

  const bodyClass = `panel-body flex-1 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-[#262626] ${currentTab === "stores" ? "sb-list" : "city-list"}`;
  return { header, actions, storeFilters, content, footer, bodyClass };
}

/** The open panel on a large screen: a column over the left of the map, next to the icon rail. */
function PanelOverlay(props: SidebarProps) {
  const { header, storeFilters, content, footer, bodyClass } = usePanelParts(props);
  return (
    <AnimatePresence>
      {props.isOpen && (
        <motion.aside
          key="panel"
          initial={{ x: "-100%", opacity: 0.6 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "-100%", opacity: 0 }}
          transition={{ type: "tween", duration: 0.2, ease: "easeOut" }}
          aria-label={`${panelTab(props.currentTab).title} panel`}
          className={`sidebar panel-overlay ${props.currentTab === "renewals" ? "sidebar-wide" : ""} flex flex-col overflow-hidden`}
        >
          <div className="sb-top">
            {header}
            {storeFilters}
          </div>
          <div className={bodyClass}>{content}</div>
          <div className="panel-foot text-center border-t border-[#262626] bg-[#0a0a0a]">
            <span className="text-[11px] text-gray-400 font-bold tracking-tight uppercase">{footer}</span>
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

type PanelSnap = "bar" | "half" | "full";
const PANEL_SNAPS: PanelSnap[] = ["bar", "half", "full"];
const BAR_ESTIMATE = 96; // the handle, the icons and the summary line, before they're measured

/**
 * The panels on a smaller screen: a sheet over the bottom of the map. Closed, it's a bar with the panel icons;
 * picking one, or dragging it up, opens that panel to half the map, and it drags up to nearly all of it.
 */
function PanelSheet(props: SidebarProps) {
  const { isOpen, currentTab, onSelectTab, onOpen, onClose, onInset, badges } = props;
  const { actions, storeFilters, content, footer, bodyClass } = usePanelParts(props);
  const ref = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<"half" | "full">("half");
  const [room, setRoom] = useState({ area: 0, bar: BAR_ESTIMATE });

  useLayoutEffect(() => {
    const sheet = ref.current;
    const area = sheet?.parentElement;
    if (!sheet || !area) return;
    const measure = () =>
      setRoom({
        area: area.clientHeight,
        bar: (barRef.current?.offsetTop ?? 0) + (barRef.current?.offsetHeight ?? 88) + 6,
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, []);

  const heights: Record<PanelSnap, number> = {
    bar: room.bar,
    half: Math.max(room.bar, Math.round(room.area * 0.55)),
    full: Math.max(room.bar, room.area - 64), // a strip of the map stays in view, to see what was picked
  };
  const snap: PanelSnap = isOpen ? size : "bar";
  const setSnap = (next: PanelSnap) => {
    if (next === "bar") onClose();
    else {
      setSize(next);
      if (!isOpen) onOpen();
    }
  };
  const { dragHeight, dragging, handlers, onHandleKey } = useSheetDrag({
    snaps: PANEL_SNAPS,
    heights,
    snap,
    setSnap,
    onHandleTap: () => setSnap(snap === "bar" ? "half" : snap === "half" ? "full" : "bar"),
  });
  const shown = heights[snap];

  useEffect(() => {
    if (room.area) onInset(shown);
  }, [shown, room.area, onInset]);
  useEffect(() => () => onInset(0), [onInset]);

  return (
    <section
      ref={ref}
      data-snap={snap}
      aria-label="Panels"
      {...handlers}
      className={`panel-sheet absolute left-0 right-0 bottom-0 flex flex-col overflow-hidden ${dragging ? "dragging" : ""}`}
      style={{ height: dragHeight ?? shown }}
    >
      <div ref={barRef} data-sheet-drag className="panel-sheet-bar shrink-0">
        <button
          className="sheet-handle"
          aria-label={snap === "full" ? "Close the panel (or drag it)" : "Make the panel bigger (or drag it)"}
          onClick={(e) => {
            if (e.detail === 0) setSnap(snap === "bar" ? "half" : snap === "half" ? "full" : "bar");
          }}
          onKeyDown={onHandleKey}
        >
          <span />
        </button>
        <div className="panel-sheet-tabs grid grid-cols-5">
          {PANEL_TABS.map((item) => (
            <PanelButton
              key={item.tab}
              item={item}
              withLabel
              active={isOpen && currentTab === item.tab}
              badge={item.tab === "renewals" ? badges.renewals : undefined}
              onClick={() => onSelectTab(item.tab)}
            />
          ))}
        </div>
        <div className="panel-sheet-summary flex items-center justify-between gap-2">
          {isOpen ? (
            <>
              <h2 className="panel-title truncate">
                {panelTab(currentTab).title}
                <span className="panel-sheet-count"> · {footer}</span>
              </h2>
              {actions}
            </>
          ) : (
            <span className="flex-1 text-center">Swipe up · {footer}</span>
          )}
        </div>
      </div>
      {isOpen && (
        <div className={bodyClass}>
          {storeFilters}
          {content}
        </div>
      )}
    </section>
  );
}

/** The panels (Stores, City, Growth, Renewals, Layers, Data quality): a column over the map, or a sheet on smaller screens. */
export default function Sidebar(props: SidebarProps) {
  return props.layout === "sheet" ? <PanelSheet {...props} /> : <PanelOverlay {...props} />;
}
