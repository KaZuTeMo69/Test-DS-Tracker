import { useState, useEffect, useMemo, useCallback } from "react";
import { RefreshCw, Settings, Filter, FileEdit, ChevronDown, Store as StoreIcon, Upload } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import L from "leaflet";
import { Store, CitySummary } from "./types";
import { fetchSheetData } from "./lib/sheets";
import { SAMPLE_STORES } from "./data/sampleStores";
import { isLive, isPaid } from "./constants";
import MapComponent from "./components/Map";
import UploadModal from "./components/UploadModal";
import Sidebar from "./components/Sidebar";
import KPIBar from "./components/KPIBar";
import DetailPanel from "./components/DetailPanel";

export default function App() {
  const [sheetId, setSheetId] = useState<string>(() => sessionStorage.getItem("ds_sheet_id") || "");
  const [sheetTab, setSheetTab] = useState<string>(() => sessionStorage.getItem("ds_sheet_tab") || "All Countries");
  const [stores, setStores] = useState<Store[]>(SAMPLE_STORES);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [loadingPct, setLoadingPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string>("");
  const currency = "SAR";

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [liveFilter, setLiveFilter] = useState<"all" | "live" | "notlive">("all");
  const [paidFilter, setPaidFilter] = useState<"all" | "paid" | "notpaid">("all");
  const [cityFilter, setCityFilter] = useState("");
  const [currentTab, setCurrentTab] = useState<"stores" | "cities" | "insights">("stores");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  // Map/Selection State
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNightMode, setIsNightMode] = useState(true);
  const [focusedCity, setFocusedCity] = useState<string | null>(null);
  const [kmlLayers, setKmlLayers] = useState<L.Layer[]>([]);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2800);
  }, []);

  const loadDataFromSheet = useCallback(async (id: string, tab?: string, isRefresh = false) => {
    if (!id) return;
    
    try {
      if (!isRefresh) {
        setIsLoading(true);
        setLoadingPct(10);
        setLoadingMsg("Connecting to Google Sheets...");
      }
      
      const data = await fetchSheetData(id, tab);
      
      if (data.length === 0) {
        throw new Error("No store data found in this sheet. Please ensure it follows the required column schema.");
      }

      if (!isRefresh) {
        setLoadingPct(80);
        setLoadingMsg("Parsing store data...");
      }
      
      setStores(data);
      setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setError(null);
      setIsUploadModalOpen(false);
      
      showToast(isRefresh ? "Dashboard refreshed" : `Loaded ${data.length} stores from Google Sheet`);
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      setError(errMsg || "Failed to load data. Please check Sheet URL and permissions.");
    } finally {
      setIsLoading(false);
      setLoadingPct(100);
    }
  }, [showToast]);

  useEffect(() => {
    if (sheetId) {
      loadDataFromSheet(sheetId, sheetTab);
    }
  }, [sheetId, sheetTab, loadDataFromSheet]);

  // Auto-refresh every 5 minutes if sheetId is loaded
  useEffect(() => {
    const timer = setInterval(() => {
      if (sheetId) {
        loadDataFromSheet(sheetId, sheetTab, true);
      }
    }, 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [sheetId, sheetTab, loadDataFromSheet]);

  const handleAddStore = useCallback((newStore: Omit<Store, 'id'>) => {
    setStores((prev) => {
      const maxId = prev.reduce((max, s) => (s.id > max ? s.id : max), 0);
      const storeWithId: Store = {
        ...newStore,
        id: maxId + 1,
      };
      return [...prev, storeWithId];
    });
  }, []);

  const handleStoresImported = (importedStores: Store[], sourceName: string) => {
    setStores(importedStores);
    setLastSync(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    showToast(`Successfully imported ${importedStores.length} stores from ${sourceName}`);
  };

  const handleGoogleSheetImport = (url: string) => {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
    if (!m) {
      setError("Invalid Google Sheets URL. Please copy the full URL from your browser address bar.");
      return;
    }
    const id = m[1];
    setSheetId(id);
    sessionStorage.setItem("ds_sheet_id", id);
    setError(null);
    loadDataFromSheet(id, sheetTab);
  };

  const getGlobalFilter = useCallback((s: Store, query: string, live: string, paid: string) => {
    const mq = !query || 
      s.name.toLowerCase().includes(query.toLowerCase()) || 
      (s.city && s.city.toLowerCase().includes(query.toLowerCase())) || 
      (s.dsCode && s.dsCode.toLowerCase().includes(query.toLowerCase()));
    const ms = live === "all" || (live === "live" && isLive(s)) || (live === "notlive" && !isLive(s));
    const mp = paid === "all" || (paid === "paid" && isPaid(s)) || (paid === "notpaid" && !isPaid(s));
    return mq && ms && mp;
  }, []);

  const filteredStores = useMemo(() => {
    return stores.filter((s) => {
      const globalMatch = getGlobalFilter(s, searchQuery, liveFilter, paidFilter);
      const mc = !cityFilter || s.city === cityFilter;
      return globalMatch && mc;
    }).sort((a, b) => {
      const ra = a.rentSARAnnual;
      const rb = b.rentSARAnnual;
      return (rb || 0) - (ra || 0);
    });
  }, [stores, searchQuery, liveFilter, paidFilter, cityFilter, getGlobalFilter]);

  const citySummaries = useMemo(() => {
    const map = new Map<string, CitySummary>();
    
    const baseStores = stores.filter(s => getGlobalFilter(s, searchQuery, liveFilter, paidFilter));

    baseStores.forEach((s) => {
      const city = s.city || "Unknown";
      if (!map.has(city)) {
        map.set(city, { city, country: "KSA", count: 0, live: 0, paid: 0, annualRent: 0, area: 0 });
      }
      const c = map.get(city)!;
      c.count++;
      if (isLive(s)) c.live++;
      if (isPaid(s)) c.paid++;
      
      const rentVal = s.rentSARAnnual;
      c.annualRent += (rentVal || 0);
      c.area += (s.size || 0);
    });
    return Array.from(map.values()).sort((a, b) => b.annualRent - a.annualRent);
  }, [stores, searchQuery, liveFilter, paidFilter, getGlobalFilter]);

  const selectedStore = useMemo(() => 
    stores.find(s => s.id === selectedId) || null
  , [stores, selectedId]);

  const allCities = useMemo(() => 
    Array.from(new Set(stores.map(s => s.city).filter(Boolean))).sort()
  , [stores]);

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
          <span className="logo-title logo-text text-sm font-bold tracking-wider hidden sm:inline uppercase font-['Oswald'] italic text-white">
            Dark Store <span className="text-[#fbbf24]">Tracker</span>
          </span>
        </div>

        <div className="flex-1"></div>
        
        <div className="px-3.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-full text-[10px] text-green-400 font-bold tracking-widest whitespace-nowrap hidden lg:block">
          ✦ LIVE NETWORK STATUS
        </div>
        
        {lastSync && (
          <span className="text-[11px] text-gray-500 font-mono hidden md:inline">Synced: {lastSync}</span>
        )}
        
        <div className="flex items-center gap-2.5 relative">
          <button 
            onClick={() => setIsUploadModalOpen(true)}
            className="px-3.5 py-2 bg-[#fbbf24] hover:bg-[#ffe169] text-black border-none rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer shadow-sm active:scale-95 uppercase tracking-wider"
            title="Upload CSV/JSON file or sync Google Sheet"
          >
            <Upload size={14} />
            <span className="hidden sm:inline">Upload Data</span>
          </button>

          {sheetId && (
            <button 
              onClick={() => loadDataFromSheet(sheetId, sheetTab, true)}
              className="px-3 py-2 bg-[#1a1a1a] border border-[#333] hover:border-[#fbbf24] rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 text-[#EFEFEF] cursor-pointer shadow-sm active:scale-95"
              title="Sync from Google Sheet"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin text-[#fbbf24]" : ""} />
              <span className="hidden md:inline uppercase">Sync Sheet</span>
            </button>
          )}

          <div className="relative">
            <button 
              onClick={() => setShowSettingsMenu(!showSettingsMenu)}
              className={`flex items-center gap-1.5 h-9 px-2.5 bg-[#1a1a1a] border ${showSettingsMenu ? 'border-[#fbbf24]' : 'border-[#333]'} hover:border-[#fbbf24] rounded-lg text-sm transition-all cursor-pointer text-[#9a9a9a] active:scale-95`}
              title="Settings"
            >
              <Settings size={16} className={showSettingsMenu ? "text-[#fbbf24]" : ""} />
              <ChevronDown size={14} className={`transition-transform duration-200 ${showSettingsMenu ? "rotate-180" : ""}`} />
            </button>

            <AnimatePresence>
              {showSettingsMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-[100]" 
                    onClick={() => setShowSettingsMenu(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-2 w-48 bg-[#111111] border border-[#262626] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)] z-[101] overflow-hidden"
                  >
                    <div className="p-1.5 flex flex-col gap-1">
                      <button
                        onClick={() => {
                          setIsUploadModalOpen(true);
                          setShowSettingsMenu(false);
                        }}
                        className="flex items-center gap-3 w-full px-3 py-2.5 text-[11px] font-black uppercase text-gray-300 hover:text-[#fbbf24] hover:bg-white/5 rounded-lg transition-all text-left"
                      >
                        <FileEdit size={14} />
                        <span>Import / Upload</span>
                      </button>
                      
                      <button
                        onClick={() => {
                          setStores(SAMPLE_STORES);
                          setSheetId("");
                          sessionStorage.removeItem("ds_sheet_id");
                          showToast("Reset to sample dark stores");
                          setShowSettingsMenu(false);
                        }}
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

      <KPIBar stores={filteredStores} currency={currency} />

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
          onSelectStore={setSelectedId}
          onImportSheet={() => setIsUploadModalOpen(true)}
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
          cityFilter={cityFilter}
          setCityFilter={setCityFilter}
          allCities={allCities}
          currency={currency}
        />

        <div className="map-container flex-1 relative min-w-0" onClick={() => {
          if (selectedId !== null) setSelectedId(null);
        }}>
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
            onClose={() => setSelectedId(null)}
            currency={currency}
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
          </div>
        </div>
      </main>

      {toastMsg && (
        <div className="fixed bottom-[22px] left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[#464646] text-[#EFEFEF] text-[13px] px-5 py-[10px] rounded-[30px] z-[999] shadow-[0_4px_20px_rgba(0,0,0,0.4)] animate-in fade-in slide-in-from-bottom-4 duration-300">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
