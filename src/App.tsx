import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { CoverageFilter, LayerKind, PolygonRings, SidebarTab, ZoneLayer } from "./types";
import { hasCoords } from "./lib/checks";
import { analyseCoverage } from "./lib/coverage";
import { download } from "./lib/download";
import { kmlFileName, layerToKml } from "./lib/kmlExport";
import { zoneBounds, zoneColor } from "./lib/layers";
import { useFilters } from "./hooks/useFilters";
import { useLayers } from "./hooks/useLayers";
import { isManualStore, useStores } from "./hooks/useStores";
import { useToast } from "./hooks/useToast";
import CoverageSummary from "./components/CoverageSummary";
import DetailPanel from "./components/DetailPanel";
import Header from "./components/Header";
import KPIBar from "./components/KPIBar";
import LayersPanel from "./components/LayersPanel";
import MapComponent from "./components/Map";
import { ZoomRequest } from "./components/map/MapController";
import { MapMode } from "./components/map/ZoneEditor";
import { ZoneRef } from "./components/map/ZoneLayers";
import MapLegend from "./components/MapLegend";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import UploadModal from "./components/UploadModal";
import ZoneCard from "./components/ZoneCard";

// Below this width the sidebar covers the store card, so picking something in it closes it
const NARROW_SCREEN = 1024;
// Room kept free when zooming to an area: the sidebar on the left, a store or zone card on the right
const SIDEBAR_ROOM = 390;
const CARD_ROOM = 420;

export default function App() {
  const { message: toastMsg, showToast } = useToast();
  const data = useStores(showToast);
  const { stores } = data;
  const mapLayers = useLayers(showToast);
  // Which zones each store is in, across all stores (live or not) and the layers shown on the map
  const coverage = useMemo(() => analyseCoverage(stores, mapLayers.layers), [stores, mapLayers.layers]);
  const { filters, filteredStores, citySummaries, allCities, unclear, showUnclearOnly, showCoverageOnly } = useFilters(
    stores,
    coverage,
  );

  // Sidebar, map and selection
  const [currentTab, setCurrentTab] = useState<SidebarTab>("stores");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isNightMode, setIsNightMode] = useState(true);
  const [focusedCity, setFocusedCity] = useState<string | null>(null);
  // A selected map zone; a store and a zone are never selected at the same time, so one card shows
  const [selectedZone, setSelectedZone] = useState<ZoneRef | null>(null);
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest | null>(null);
  // Drawing a new zone or editing a zone's shape; the cards are hidden meanwhile so the map is clear
  const [mapMode, setMapMode] = useState<MapMode | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  const selectedStore = useMemo(() => stores.find((s) => s.id === selectedId) || null, [stores, selectedId]);
  // The zone's card closes if its layer is hidden or deleted
  const zoneSelection = useMemo(() => {
    const layer = selectedZone && mapLayers.layers.find((l) => l.id === selectedZone.layerId && l.visible);
    const zone = layer && layer.zones.find((z) => z.id === selectedZone.zoneId);
    return layer && zone ? { layer, zone } : null;
  }, [selectedZone, mapLayers.layers]);
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
    filters.setCoverageOnly(null);
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

  const showCoverageStores = (filter: CoverageFilter) => {
    showCoverageOnly(filter);
    setFocusedCity(null);
    setCurrentTab("stores");
    setIsSidebarOpen(true);
  };

  const closeStore = useCallback(() => setSelectedId(null), []);
  const selectStore = useCallback((id: number) => {
    setSelectedId(id);
    setSelectedZone(null);
  }, []);
  const selectFromList = useCallback(
    (id: number) => {
      selectStore(id);
      if (window.innerWidth < NARROW_SCREEN) setIsSidebarOpen(false);
    },
    [selectStore],
  );

  const zoomTo = (bounds: ReturnType<typeof zoneBounds>, { sidebar, card }: { sidebar: boolean; card: boolean }) => {
    if (!bounds) return;
    const wide = window.innerWidth >= NARROW_SCREEN;
    setZoomRequest({
      id: Date.now(),
      bounds,
      padLeft: sidebar && wide ? SIDEBAR_ROOM : 40,
      padRight: card && wide ? CARD_ROOM : 40,
    });
  };

  // A zone clicked on the map is already in view; one picked in the Layers list is zoomed to
  const selectZone = useCallback((layerId: string, zoneId: string) => {
    setSelectedZone({ layerId, zoneId });
    setSelectedId(null);
  }, []);
  const selectZoneFromList = (layerId: string, zoneId: string) => {
    selectZone(layerId, zoneId);
    const zone = mapLayers.layers.find((l) => l.id === layerId)?.zones.find((z) => z.id === zoneId);
    if (zone) zoomTo(zoneBounds([zone]), { sidebar: true, card: true });
    if (!mapLayers.layers.find((l) => l.id === layerId)?.visible) mapLayers.updateLayer(layerId, { visible: true });
    if (window.innerWidth < NARROW_SCREEN) setIsSidebarOpen(false);
  };
  // The same, as a callback that never changes, for the memoised store card
  const selectZoneRef = useRef(selectZoneFromList);
  useEffect(() => {
    selectZoneRef.current = selectZoneFromList;
  });
  const openZone = useCallback((layerId: string, zoneId: string) => selectZoneRef.current(layerId, zoneId), []);

  const importLayers = async (files: File[]) => {
    const added = await mapLayers.importFiles(files);
    zoomTo(zoneBounds(added.flatMap((l) => l.zones)), { sidebar: true, card: false });
  };

  const openLayers = () => {
    setCurrentTab("layers");
    setIsSidebarOpen(true);
  };

  const addLayer = (kind: LayerKind) => {
    const layer = mapLayers.addLayer(kind);
    showToast(`Added the layer "${layer.name}". Use Draw zone to draw on the map`);
  };

  const startDrawing = (layerId: string) => {
    const layer = mapLayers.layers.find((l) => l.id === layerId);
    if (!layer) return;
    if (!layer.visible) mapLayers.updateLayer(layerId, { visible: true });
    setSelectedId(null);
    setSelectedZone(null);
    setMapMode({ kind: "draw", layerId, color: layer.color });
    if (window.innerWidth < NARROW_SCREEN) setIsSidebarOpen(false);
  };

  const finishDrawing = (polygons: PolygonRings[]) => {
    if (mapMode?.kind !== "draw") return;
    const zone = mapLayers.addZone(mapMode.layerId, polygons);
    setMapMode(null);
    // The new zone's card opens so it can be named
    if (zone) setSelectedZone({ layerId: mapMode.layerId, zoneId: zone.id });
  };

  const startEditingShape = () => {
    if (!zoneSelection) return;
    const { layer, zone } = zoneSelection;
    setMapMode({
      kind: "edit",
      layerId: layer.id,
      zoneId: zone.id,
      color: zoneColor(zone, layer),
      polygons: zone.polygons,
    });
  };

  const finishEditingShape = (polygons: PolygonRings[]) => {
    if (mapMode?.kind !== "edit") return;
    mapLayers.updateZone(mapMode.layerId, mapMode.zoneId, { polygons });
    setMapMode(null);
    showToast("Shape saved");
  };

  const deleteSelectedZone = () => {
    if (!zoneSelection) return;
    mapLayers.removeZone(zoneSelection.layer.id, zoneSelection.zone.id);
    setSelectedZone(null);
    showToast(`Deleted "${zoneSelection.zone.name || "Unnamed zone"}"`);
  };

  const exportLayer = (layer: ZoneLayer) => {
    download(kmlFileName(layer), layerToKml(layer), "application/vnd.google-earth.kml+xml");
    showToast(`Saved ${kmlFileName(layer)}. In My Maps, add a layer and choose Import to bring it in`);
  };

  const zoneCount = mapLayers.layers.reduce((n, l) => n + l.zones.length, 0);
  const layersSummary = `${mapLayers.layers.length} ${mapLayers.layers.length === 1 ? "layer" : "layers"} · ${zoneCount} ${zoneCount === 1 ? "zone" : "zones"}`;

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
          coverage={coverage}
          insightsExtra={
            <CoverageSummary
              coverage={coverage}
              storeCount={stores.length}
              zoneCount={zoneCount}
              onShowStores={showCoverageStores}
              onSelectZone={selectZoneFromList}
              onOpenLayers={openLayers}
            />
          }
          layersSummary={layersSummary}
          layersPanel={
            <LayersPanel
              layers={mapLayers.layers}
              canSave={mapLayers.canSave}
              selectedZone={zoneSelection ? selectedZone : null}
              onImport={importLayers}
              onUpdateLayer={mapLayers.updateLayer}
              onRemoveLayer={mapLayers.removeLayer}
              onClearAll={mapLayers.clearAll}
              onSelectZone={selectZoneFromList}
              onAddLayer={addLayer}
              onDrawZone={startDrawing}
              onExport={exportLayer}
            />
          }
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
              onSelectStore={selectStore}
              onMapClick={() => {
                setSelectedId(null);
                setSelectedZone(null);
                setFocusedCity(null);
              }}
              isNightMode={isNightMode}
              setIsNightMode={setIsNightMode}
              focusedCity={focusedCity}
              layers={mapLayers.layers}
              selectedZone={zoneSelection ? selectedZone : null}
              onSelectZone={selectZone}
              onOpenLayers={openLayers}
              zoomRequest={zoomRequest}
              cardOpen={selectedId !== null || zoneSelection !== null}
              mapMode={mapMode}
              onDrawn={finishDrawing}
              onEdited={finishEditingShape}
              onCancelMode={() => setMapMode(null)}
              onAddStore={data.addManualStore}
              showToast={showToast}
            />
          </div>

          <DetailPanel
            store={mapMode ? null : selectedStore}
            stores={stores}
            coverage={coverage}
            onSelectZone={openZone}
            onClose={closeStore}
            onRemove={
              selectedStore && isManualStore(selectedStore)
                ? () => handleRemoveManualStore(selectedStore.id)
                : undefined
            }
          />

          {zoneSelection && !selectedStore && !mapMode && (
            <ZoneCard
              key={zoneSelection.zone.id}
              layer={zoneSelection.layer}
              zone={zoneSelection.zone}
              storesInside={coverage.storesIn.get(zoneSelection.zone.id) ?? []}
              onSelectStore={selectStore}
              onChange={(patch, delay) =>
                mapLayers.updateZone(zoneSelection.layer.id, zoneSelection.zone.id, patch, delay)
              }
              onClose={() => setSelectedZone(null)}
              onEditShape={startEditingShape}
              onDelete={deleteSelectedZone}
            />
          )}

          <MapLegend notOnMap={notOnMap} />
        </div>
      </main>

      <Toast message={toastMsg} />
    </div>
  );
}
