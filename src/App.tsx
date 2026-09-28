import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import { ChevronDown, FileEdit, Filter, RefreshCw, Settings, Store as StoreIcon, Upload } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CitySummary, RenewalFilter, Store } from "./types";
import { hasCoords, hasUnclearStatus, isLive, isPaid, liveStatus, paidStatus } from "./constants";
import { SAMPLE_STORES } from "./data/sampleStores";
import { renewalInfo } from "./lib/contract";
import { fetchSheetData } from "./lib/sheets";
import { loadManualStores, loadSheetId, ManualStore, saveManualStores, saveSheetId } from "./lib/storage";
import DetailPanel from "./components/DetailPanel";
import KPIBar from "./components/KPIBar";
import MapComponent from "./components/Map";
import Sidebar from "./components/Sidebar";
import UploadModal from "./components/UploadModal";

// The sheet tab that holds the store list
const SHEET_TAB = "All Countries";

// Manually added stores get ids from here up, so they never collide with imported stores
const MANUAL_ID_BASE = 1_000_000;

const isManualStore = (s: Store) => s.id > MANUAL_ID_BASE;

const withManualIds = (list: ManualStore[]): Store[] => list.map((s, i) => ({ ...s, id: MANUAL_ID_BASE + i + 1 }));

// How a sheet load started: a link entered in the upload window, the sheet saved on an earlier visit,
// the Sync Sheet button, or the 5-minute auto-refresh
type SheetLoad = "import" | "restore" | "manual" | "auto";

const syncTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Gives each store the same id on every load (keyed by DS code, else name + city), so a
 * sheet refresh doesn't make the open store or the map pins jump to a different store
 * when rows are inserted or removed in the sheet.
 */
function assignStableIds(list: Store[], idsByKey: Map<string, number>): Store[] {
  const seen = new Map<string, number>();
  return list.map((s) => {
    const base = s.dsCode.trim()
      ? `code:${s.dsCode.trim().toLowerCase()}`
      : `name:${s.name.trim().toLowerCase()}|${s.city.trim().toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const key = `${base}#${n}`;
    let id = idsByKey.get(key);
    if (id === undefined) {
      id = idsByKey.size + 1;
      idsByKey.set(key, id);
    }
    return { ...s, id };
  });
}

/** The search box, Live / Paid / Renewal filters and "unclear status only" (the city filter is applied separately). */
function matchesFilters(
  s: Store,
  query: string,
  live: string,
  paid: string,
  renewal: RenewalFilter,
  unclearOnly: boolean,
): boolean {
  const q = query.toLowerCase();
  const matchesQuery =
    !query ||
    s.name.toLowerCase().includes(q) ||
    (s.city && s.city.toLowerCase().includes(q)) ||
    (s.dsCode && s.dsCode.toLowerCase().includes(q));
  const matchesLive = live === "all" || (live === "live" && isLive(s)) || (live === "notlive" && !isLive(s));
  const matchesPaid = paid === "all" || (paid === "paid" && isPaid(s)) || (paid === "notpaid" && !isPaid(s));
  const status = renewal === "all" ? null : renewalInfo(s).status;
  const matchesRenewal =
    renewal === "all" ||
    (renewal === "renew" && (status === "now" || status === "soon")) ||
    (renewal === "expired" && status === "expired");
  const matchesUnclear = !unclearOnly || hasUnclearStatus(s);
  return Boolean(matchesQuery && matchesLive && matchesPaid && matchesRenewal && matchesUnclear);
}

const BADGE_TONE = {
  green: { pill: "bg-green-500/10 border-green-500/25 text-green-400", dot: "bg-green-400" },
  red: { pill: "bg-red-500/10 border-red-500/30 text-red-400", dot: "bg-red-400" },
  grey: { pill: "bg-white/5 border-white/15 text-gray-300", dot: "bg-gray-400" },
};

/** Where the data on screen comes from, and whether it's current. */
function SourceBadge({
  sheetId,
  lastSync,
  syncError,
  fileName,
}: {
  sheetId: string;
  lastSync: string;
  syncError: string | null;
  fileName: string | null;
}) {
  let tone: keyof typeof BADGE_TONE = "grey";
  let label = "Sample data";
  let detail = "";
  let title = "Sample stores for trying the app. Use Upload Data to load your own.";
  if (sheetId && syncError) {
    tone = "red";
    label = "Sync failed";
    detail = lastSync ? `data from ${lastSync}` : "no data loaded";
    title = `Google Sheet sync failed: ${syncError}${lastSync ? `. Showing the data from ${lastSync}.` : ""}`;
  } else if (sheetId && !lastSync) {
    label = "Connecting";
    title = "Loading your Google Sheet";
  } else if (sheetId) {
    tone = "green";
    label = "Synced";
    detail = lastSync;
    title = `Google Sheet synced at ${lastSync}. It refreshes every 5 minutes.`;
  } else if (fileName) {
    label = "Local file";
    detail = fileName;
    title = `Data from ${fileName}. It doesn't update by itself; import it again to refresh.`;
  }

  return (
    <div
      className={`flex items-center gap-2 min-w-0 px-3 py-1.5 border rounded-full text-[10px] font-bold uppercase tracking-widest whitespace-nowrap ${BADGE_TONE[tone].pill}`}
      title={title}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${BADGE_TONE[tone].dot} ${label === "Connecting" ? "animate-pulse" : ""}`}
      />
      <span>{label}</span>
      {detail && (
        <span className="hidden md:inline font-mono font-normal normal-case tracking-normal truncate max-w-[160px]">
          · {detail}
        </span>
      )}
    </div>
  );
}

export default function App() {
  // Data source: the sample stores, a Google Sheet (sheetId set) or an imported file (fileName set)
  const storeIdsRef = useRef(new Map<string, number>());
  // Bumped by every load or import; a sheet request that finishes after a newer one started is ignored
  const loadSeqRef = useRef(0);
  const [sheetId, setSheetId] = useState(loadSheetId);
  const [fileName, setFileName] = useState<string | null>(null);
  // Stores from the sample data, sheet or imported file. While a saved sheet is loading there are none,
  // so the sample stores never show as if they were yours
  const [baseStores, setBaseStores] = useState<Store[]>(() =>
    sheetId ? [] : assignStableIds(SAMPLE_STORES, storeIdsRef.current),
  );
  // Kept separately, and saved in this browser, so reloads and new data don't wipe them
  const [manualStores, setManualStores] = useState<Store[]>(() => withManualIds(loadManualStores()));

  // Loading and sync status
  const [isLoading, setIsLoading] = useState(false); // a sheet link from the upload window is loading
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null); // shown in the upload window
  const [isSyncing, setIsSyncing] = useState(false); // any sheet request in flight
  const sheetBusyRef = useRef(false); // the same, for the auto-refresh timer
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string>(""); // time of the last successful sheet load
  const syncFailedRef = useRef(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [liveFilter, setLiveFilter] = useState<"all" | "live" | "notlive">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "notpaid">("all");
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>("all");
  const [cityFilter, setCityFilter] = useState("");
  const [unclearOnly, setUnclearOnly] = useState(false);

  // Sidebar, map and selection
  const [currentTab, setCurrentTab] = useState<"stores" | "cities" | "insights">("stores");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNightMode, setIsNightMode] = useState(true);
  const [focusedCity, setFocusedCity] = useState<string | null>(null);
  const [kmlLayers, setKmlLayers] = useState<L.Layer[]>([]);

  // Overlays
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | undefined>(undefined);

  // A new message restarts the timer, so it isn't cut short by the previous message's timer
  const showToast = useCallback((msg: string) => {
    window.clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 2800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimerRef.current), []);

  const loadDataFromSheet = useCallback(
    async (id: string, mode: SheetLoad): Promise<boolean> => {
      // The auto-refresh waits for its next turn rather than cutting off a load in progress (such as a new sheet link)
      if (mode === "auto" && sheetBusyRef.current) return false;
      const seq = ++loadSeqRef.current;
      sheetBusyRef.current = true;
      setIsSyncing(true);
      if (mode === "import") {
        setIsLoading(true);
        setLoadingMsg("Connecting to Google Sheets...");
      }

      try {
        const data = await fetchSheetData(id, SHEET_TAB);
        if (seq !== loadSeqRef.current) return false;

        if (data.length === 0) {
          throw new Error("No store data found in this sheet. Please ensure it follows the required column schema.");
        }

        setBaseStores(assignStableIds(data, storeIdsRef.current));
        setFileName(null);
        setLastSync(syncTime());
        setError(null);
        setSyncError(null);
        syncFailedRef.current = false;

        if (mode === "import") setIsUploadModalOpen(false);
        if (mode === "import" || mode === "restore") showToast(`Loaded ${data.length} stores from Google Sheet`);
        if (mode === "manual") showToast("Google Sheet synced");
        return true;
      } catch (err: unknown) {
        if (seq !== loadSeqRef.current) return false;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (mode === "import") {
          setError(errMsg || "Failed to load data. Please check Sheet URL and permissions.");
        } else {
          // Keep showing the last good data (if any); the header badge says it's stale. The auto-refresh
          // only announces its first failure, not one every 5 minutes
          if (mode !== "auto" || !syncFailedRef.current) showToast(`Sheet sync failed: ${errMsg}`);
          setSyncError(errMsg || "Sheet sync failed");
          syncFailedRef.current = true;
        }
        return false;
      } finally {
        if (seq === loadSeqRef.current) {
          sheetBusyRef.current = false;
          setIsSyncing(false);
          setIsLoading(false);
        }
      }
    },
    [showToast],
  );

  // Load the sheet saved on an earlier visit, once at start (a sheet linked later is loaded by its import)
  const savedSheetIdRef = useRef(sheetId);
  useEffect(() => {
    if (savedSheetIdRef.current) loadDataFromSheet(savedSheetIdRef.current, "restore");
  }, [loadDataFromSheet]);

  // Auto-refresh every 5 minutes while a sheet is linked
  useEffect(() => {
    if (!sheetId) return;
    const timer = setInterval(() => loadDataFromSheet(sheetId, "auto"), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [sheetId, loadDataFromSheet]);

  // Remember manual stores between visits
  useEffect(() => saveManualStores(manualStores), [manualStores]);

  const openUploadModal = () => {
    setError(null);
    setIsUploadModalOpen(true);
  };

  const handleGoogleSheetImport = async (url: string) => {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
    if (!m) {
      setError("Invalid Google Sheets URL. Please copy the full URL from your browser address bar.");
      return;
    }
    const id = m[1];
    setError(null);
    // Only remember (and auto-refresh) the sheet once it has loaded successfully
    if (await loadDataFromSheet(id, "import")) {
      setSheetId(id);
      saveSheetId(id);
    }
  };

  const handleStoresImported = (importedStores: Store[], sourceName: string) => {
    // The file replaces the sheet as the data source, so stop syncing the sheet;
    // otherwise the next auto-refresh would overwrite the imported stores
    const wasSyncing = !!sheetId;
    loadSeqRef.current++;
    sheetBusyRef.current = false;
    setIsLoading(false);
    setIsSyncing(false);
    setSheetId("");
    saveSheetId("");
    setSyncError(null);
    syncFailedRef.current = false;
    setLastSync("");
    setFileName(sourceName);
    setBaseStores(assignStableIds(importedStores, storeIdsRef.current));
    showToast(
      `Successfully imported ${importedStores.length} stores from ${sourceName}${wasSyncing ? ". Google Sheet sync is off" : ""}`,
    );
  };

  const handleResetSample = () => {
    loadSeqRef.current++;
    sheetBusyRef.current = false;
    setIsLoading(false);
    setIsSyncing(false);
    setBaseStores(assignStableIds(SAMPLE_STORES, storeIdsRef.current));
    setManualStores([]); // also removes the saved copy
    setSheetId("");
    saveSheetId("");
    setFileName(null);
    setSyncError(null);
    syncFailedRef.current = false;
    setLastSync("");
    setUnclearOnly(false);
    showToast("Reset to sample data. The saved sheet link and manual stores are cleared");
    setShowSettingsMenu(false);
  };

  const handleAddStore = useCallback((newStore: ManualStore) => {
    setManualStores((prev) => {
      const id = prev.reduce((max, s) => Math.max(max, s.id), MANUAL_ID_BASE) + 1;
      return [...prev, { ...newStore, id }];
    });
  }, []);

  const handleRemoveManualStore = (id: number) => {
    setManualStores((prev) => prev.filter((s) => s.id !== id));
    setSelectedId(null);
    showToast("Manual store removed");
  };

  // Lists the stores counted in the "unclear status" warning. The other filters are cleared so the
  // list shows exactly the stores the warning counted
  const showUnclearStores = () => {
    setSearchQuery("");
    setLiveFilter("all");
    setPaidFilter("all");
    setRenewalFilter("all");
    setCityFilter("");
    setFocusedCity(null);
    setUnclearOnly(true);
    setCurrentTab("stores");
    setIsSidebarOpen(true);
  };

  const stores = useMemo(() => [...baseStores, ...manualStores], [baseStores, manualStores]);

  const filteredStores = useMemo(() => {
    return stores
      .filter((s) => {
        const matchesCity = !cityFilter || s.city === cityFilter;
        return matchesFilters(s, searchQuery, liveFilter, paidFilter, renewalFilter, unclearOnly) && matchesCity;
      })
      .sort((a, b) => {
        // With a renewal filter on, the contract ending soonest comes first; otherwise highest rent first
        if (renewalFilter !== "all") {
          return (renewalInfo(a).daysToEnd ?? Infinity) - (renewalInfo(b).daysToEnd ?? Infinity);
        }
        const ra = a.rentSARAnnual;
        const rb = b.rentSARAnnual;
        return (rb || 0) - (ra || 0);
      });
  }, [stores, searchQuery, liveFilter, paidFilter, renewalFilter, cityFilter, unclearOnly]);

  const citySummaries = useMemo(() => {
    const map = new Map<string, CitySummary>();

    stores
      .filter((s) => matchesFilters(s, searchQuery, liveFilter, paidFilter, renewalFilter, unclearOnly))
      .forEach((s) => {
        const city = s.city || "Unknown";
        if (!map.has(city)) {
          map.set(city, { city, count: 0, live: 0, paid: 0, annualRent: 0, area: 0 });
        }
        const c = map.get(city)!;
        c.count++;
        if (isLive(s)) c.live++;
        if (isPaid(s)) c.paid++;
        c.annualRent += s.rentSARAnnual || 0;
        c.area += s.size || 0;
      });
    return Array.from(map.values()).sort((a, b) => b.annualRent - a.annualRent);
  }, [stores, searchQuery, liveFilter, paidFilter, renewalFilter, unclearOnly]);

  const selectedStore = useMemo(() => stores.find((s) => s.id === selectedId) || null, [stores, selectedId]);

  const notOnMap = useMemo(() => filteredStores.filter((s) => !hasCoords(s)).length, [filteredStores]);

  const allCities = useMemo(() => Array.from(new Set(stores.map((s) => s.city).filter(Boolean))).sort(), [stores]);

  // Stores whose Live or Payment status is blank or not recognised (counted as Not Live / Unpaid), across all stores
  const unclear = useMemo(() => {
    let live = 0;
    let paid = 0;
    let total = 0;
    stores.forEach((s) => {
      const liveUnclear = liveStatus(s) === null;
      const paidUnclear = paidStatus(s) === null;
      if (liveUnclear) live++;
      if (paidUnclear) paid++;
      if (liveUnclear || paidUnclear) total++;
    });
    return { total, live, paid };
  }, [stores]);

  const listEmptyMessage =
    sheetId && !lastSync
      ? syncError
        ? "Couldn't load the Google Sheet. Use Sync Sheet to try again."
        : "Loading stores from Google Sheet…"
      : "No results found";

  return (
    <div className="app-container flex flex-col h-screen overflow-hidden bg-[#141414] text-[#EFEFEF] p-[10px] gap-[7px]">
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onStoresImported={handleStoresImported}
        onGoogleSheetImport={handleGoogleSheetImport}
        isLoading={isLoading}
        loadingMsg={loadingMsg}
        error={error}
      />

      <header className="app-header h-14 flex-shrink-0 bg-[#111111] border border-[#262626] rounded-xl flex items-center pl-4 pr-4 z-50 gap-4 shadow-lg mx-[5px]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#fbbf24]/10 border border-[#fbbf24]/20 flex items-center justify-center text-[#fbbf24] shadow-sm">
            <StoreIcon size={18} />
          </div>
          <div className="h-5 w-[1px] bg-white/10"></div>
          <span className="logo-text text-sm font-bold tracking-wider hidden sm:inline uppercase font-['Oswald'] italic text-white">
            Dark Store <span className="text-[#fbbf24]">Tracker</span>
          </span>
        </div>

        <div className="flex-1"></div>

        <SourceBadge sheetId={sheetId} lastSync={lastSync} syncError={syncError} fileName={fileName} />

        <div className="flex items-center gap-2.5 relative">
          <button
            onClick={openUploadModal}
            className="px-3.5 py-2 bg-[#fbbf24] hover:bg-[#ffe169] text-black border-none rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 uppercase tracking-wider"
            title="Upload CSV/JSON file or sync Google Sheet"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Upload Data</span>
          </button>

          {sheetId && (
            <button
              onClick={() => loadDataFromSheet(sheetId, "manual")}
              className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#fbbf24] rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-[#EFEFEF] cursor-pointer shadow-sm active:scale-95"
              title="Sync from Google Sheet"
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin text-[#fbbf24]" : ""} />
              <span className="hidden md:inline uppercase">Sync Sheet</span>
            </button>
          )}

          <div className="relative">
            <button
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className={`flex items-center gap-1.5 h-9 px-2.5 bg-[#1a1a1a] border ${showSettingsMenu ? "border-[#fbbf24]" : "border-[#333]"} hover:border-[#fbbf24] rounded-lg text-sm transition-all cursor-pointer text-[#9a9a9a] active:scale-95`}
              title="Settings"
            >
              <Settings size={16} className={showSettingsMenu ? "text-[#fbbf24]" : ""} />
              <ChevronDown
                size={14}
                className={`transition-transform duration-200 ${showSettingsMenu ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {showSettingsMenu && (
                <>
                  <div className="fixed inset-0 z-[100]" onClick={() => setShowSettingsMenu(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 bg-[#111111] border border-[#262626] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[101] overflow-hidden"
                  >
                    <div className="p-1.5 flex flex-col gap-1">
                      <button
                        onClick={() => {
                          openUploadModal();
                          setShowSettingsMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-[11px] font-black uppercase text-gray-300 hover:text-[#fbbf24] hover:bg-white/5 rounded-lg transition-all text-left"
                      >
                        <FileEdit size={14} />
                        <span>Import / Upload</span>
                      </button>

                      <button
                        onClick={handleResetSample}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-[11px] font-black uppercase text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all text-left"
                      >
                        <RefreshCw size={14} />
                        <span>Reset Sample Data</span>
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </header>

      <KPIBar stores={filteredStores} unclear={unclear} unclearOnly={unclearOnly} onShowUnclear={showUnclearStores} />

      <main className="app-main flex flex-row flex-1 overflow-hidden min-h-0 relative bg-[#0a0a0a] rounded-xl border border-[#222] shadow-2xl">
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          stores={filteredStores}
          totalStores={stores.length}
          citySummaries={citySummaries}
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          selectedId={selectedId}
          onSelectStore={(id) => {
            setSelectedId(id);
            // On narrow screens the sidebar covers the store card, so get it out of the way
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
          }}
          onImportSheet={openUploadModal}
          onCityFocus={(city) => {
            setCityFilter(city);
            setFocusedCity(city);
            if (window.innerWidth < 1024) setIsSidebarOpen(false);
          }}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          liveFilter={liveFilter}
          setLiveFilter={setLiveFilter}
          paidFilter={paidFilter}
          setPaidFilter={setPaidFilter}
          renewalFilter={renewalFilter}
          setRenewalFilter={setRenewalFilter}
          cityFilter={cityFilter}
          setCityFilter={setCityFilter}
          allCities={allCities}
          unclearOnly={unclearOnly}
          onClearUnclear={() => setUnclearOnly(false)}
          emptyMessage={listEmptyMessage}
        />

        <div
          className="map-container flex-1 relative min-w-0"
          onClick={() => {
            if (selectedId !== null) setSelectedId(null);
          }}
        >
          <AnimatePresence>
            {!isSidebarOpen && (
              <motion.button
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSidebarOpen(true);
                }}
                className="absolute top-6 left-6 w-12 h-12 flex items-center justify-center bg-[#111111]/90 backdrop-blur-md border border-[#333] rounded-xl text-[#fbbf24] shadow-2xl z-[500] cursor-pointer hover:bg-[#222] transition-transform active:scale-95"
                title="Open Navigation"
              >
                <Filter size={22} />
              </motion.button>
            )}
          </AnimatePresence>

          <div className="w-full h-full rounded-xl overflow-hidden">
            <MapComponent
              stores={filteredStores}
              selectedId={selectedId}
              onSelectStore={setSelectedId}
              onMapClick={() => {
                setSelectedId(null);
                setFocusedCity(null);
              }}
              isNightMode={isNightMode}
              setIsNightMode={setIsNightMode}
              focusedCity={focusedCity}
              kmlLayers={kmlLayers}
              setKmlLayers={setKmlLayers}
              onAddStore={handleAddStore}
              showToast={showToast}
            />
          </div>

          <DetailPanel
            store={selectedStore}
            stores={stores}
            onClose={() => setSelectedId(null)}
            onRemove={
              selectedStore && isManualStore(selectedStore)
                ? () => handleRemoveManualStore(selectedStore.id)
                : undefined
            }
          />

          <div className="absolute bottom-4 left-4 bg-[#111111]/85 backdrop-blur border border-[#333] pl-[10px] pr-[10px] pt-[7px] pb-[7px] rounded-lg flex flex-row items-center gap-4 shadow-2xl z-[500]">
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
              <div className="w-2 h-2 rounded-full bg-[#4ade80]"></div>
              <span>Live · Paid</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
              <div className="w-2 h-2 rounded-full bg-[#fbbf24]"></div>
              <span>Live · Unpaid</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
              <div className="w-2 h-2 rounded-full bg-[#f87171]"></div>
              <span>Not Live</span>
            </div>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tight">
              <div className="w-2 h-2 rounded-full bg-[#60a5fa] shadow-[0_0_5px_rgba(96,165,250,0.5)]"></div>
              <span>Selected</span>
            </div>
            {notOnMap > 0 && (
              <div
                className="flex items-center gap-2 text-[10px] text-[#FB923C] font-bold uppercase tracking-tight"
                title="Stores with missing or implausible coordinates. See the NO LOCATION tag in the list."
              >
                <span>{notOnMap} not on map</span>
              </div>
            )}
          </div>
        </div>
      </main>

      {toastMsg && (
        <div className="fixed bottom-[22px] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#464646] text-[#EFEFEF] text-[13px] px-5 py-[10px] rounded-[30px] z-[999] shadow-[0_4px_20px_rgba(0,0,0,0.4)] duration-300">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
