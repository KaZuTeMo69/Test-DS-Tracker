import { useCallback, useMemo, useState } from "react";
import L from "leaflet";
import { Filter } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SidebarTab } from "./types";
import { hasCoords } from "./lib/checks";
import { useFilters } from "./hooks/useFilters";
import { isManualStore, useStores } from "./hooks/useStores";
import { useToast } from "./hooks/useToast";
import DetailPanel from "./components/DetailPanel";
import Header from "./components/Header";
import KPIBar from "./components/KPIBar";
import MapComponent from "./components/Map";
import MapLegend from "./components/MapLegend";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import UploadModal from "./components/UploadModal";

// Below this width the sidebar covers the store card, so picking something in it closes it
const NARROW_SCREEN = 1024;

export default function App() {
  const { message: toastMsg, showToast } = useToast();
  const data = useStores(showToast);
  const { stores } = data;
  const { filters, filteredStores, citySummaries, allCities, unclear, showUnclearOnly } = useFilters(stores);

  // Sidebar, map and selection
  const [currentTab, setCurrentTab] = useState<SidebarTab>("stores");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNightMode, setIsNightMode] = useState(true);
  const [focusedCity, setFocusedCity] = useState<string | null>(null);
  const [kmlLayers, setKmlLayers] = useState<L.Layer[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const selectedStore = useMemo(() => stores.find((s) => s.id === selectedId) || null, [stores, selectedId]);
  const notOnMap = useMemo(() => filteredStores.filter((s) => !hasCoords(s)).length, [filteredStores]);

  const openUploadModal = () => {
    data.clearError();
    setIsUploadModalOpen(true);
  };

  const handleSheetImport = async (url: string) => {
    if (await data.importSheet(url)) setIsUploadModalOpen(false);
  };

  const handleResetSample = () => {
    data.resetSample();
    filters.setUnclearOnly(false);
  };

  const handleRemoveManualStore = (id: number) => {
    data.removeManualStore(id);
    setSelectedId(null);
  };

  const showUnclearStores = () => {
    showUnclearOnly();
    setFocusedCity(null);
    setCurrentTab("stores");
    setIsSidebarOpen(true);
  };

  const closeStore = useCallback(() => setSelectedId(null), []);
  const selectFromList = useCallback((id: number) => {
    setSelectedId(id);
    if (window.innerWidth < NARROW_SCREEN) setIsSidebarOpen(false);
  }, []);

  const listEmptyMessage = data.awaitingSheet
    ? data.syncError
      ? "Couldn't load the Google Sheet. Use Sync Sheet to try again."
      : "Loading stores from Google Sheet…"
    : "No results found";

  return (
    <div className="app-container flex flex-col h-screen overflow-hidden bg-[#141414] text-[#EFEFEF] p-[10px] gap-[7px]">
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onStoresImported={data.importStores}
        onGoogleSheetImport={handleSheetImport}
        isLoading={data.isLoading}
        loadingMsg={data.loadingMsg}
        error={data.error}
      />

      <Header
        sheetId={data.sheetId}
        lastSync={data.lastSync}
        syncError={data.syncError}
        fileName={data.fileName}
        isSyncing={data.isSyncing}
        onUpload={openUploadModal}
        onSync={data.syncSheet}
        onResetSample={handleResetSample}
      />

      <KPIBar
        stores={filteredStores}
        unclear={unclear}
        unclearOnly={filters.unclearOnly}
        onShowUnclear={showUnclearStores}
      />

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
          onSelectStore={selectFromList}
          onImportSheet={openUploadModal}
          onCityFocus={(city) => {
            filters.setCityFilter(city);
            setFocusedCity(city);
            if (window.innerWidth < NARROW_SCREEN) setIsSidebarOpen(false);
          }}
          filters={filters}
          allCities={allCities}
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
              onAddStore={data.addManualStore}
              showToast={showToast}
            />
          </div>

          <DetailPanel
            store={selectedStore}
            stores={stores}
            onClose={closeStore}
            onRemove={
              selectedStore && isManualStore(selectedStore)
                ? () => handleRemoveManualStore(selectedStore.id)
                : undefined
            }
          />

          <MapLegend notOnMap={notOnMap} />
        </div>
      </main>

      <Toast message={toastMsg} />
    </div>
  );
}
