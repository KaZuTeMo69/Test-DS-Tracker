import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minimize2 } from "lucide-react";
import { CoverageFilter, LayerKind, PolygonRings, SidebarTab, ZoneLayer } from "./types";
import { dataQuality, hasCoords } from "./lib/checks";
import { analyseCoverage } from "./lib/coverage";
import { csvFileName, storesToCsv } from "./lib/csvExport";
import { download } from "./lib/download";
import { kpiStats } from "./lib/kpis";
import { kmlFileName, layerToKml } from "./lib/kmlExport";
import { rentBenchmarks } from "./lib/rentStats";
import { zoneBounds, zoneColor } from "./lib/layers";
import { loadBaseMap, loadOrsKey, loadPanelOpen, saveBaseMap, saveOrsKey, savePanelOpen } from "./lib/storage";
import { BaseMapChoice, BaseMapId, chooseBaseMap, toBaseMapChoice, toggleNight } from "./lib/baseMaps";
import { LatLng } from "./lib/coords";
import { RouteInfo } from "./lib/routing";
import { useFilters } from "./hooks/useFilters";
import { useLayers } from "./hooks/useLayers";
import { useIsNarrow } from "./hooks/useMediaQuery";
import { RoadsContext } from "./hooks/useRoads";
import { SettingsContext, useSettingsState } from "./hooks/useSettings";
import { isManualStore, useStores } from "./hooks/useStores";
import { useToast } from "./hooks/useToast";
import { linkedView, useUrlState } from "./hooks/useUrlState";
import { openingSheetHeight } from "./components/CardFrame";
import CoverageSummary from "./components/CoverageSummary";
import DetailPanel from "./components/DetailPanel";
import { ExtraFigures } from "./components/KpiFigures";
import LayersPanel from "./components/LayersPanel";
import MapComponent from "./components/Map";
import { ZoomRequest } from "./components/map/MapController";
import { MapMode } from "./components/map/ZoneEditor";
import { ZoneRef } from "./components/map/ZoneLayers";
import MapLegend from "./components/MapLegend";
import NavRail from "./components/NavRail";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import Toast from "./components/Toast";
import TopBar from "./components/TopBar";
import UploadModal from "./components/UploadModal";
import ZoneCard from "./components/ZoneCard";

// Below this width the panels are a sheet over the bottom of the map, so picking something in one closes it
const NARROW_SCREEN = 1024;
// The open panel's width over the left of the map on large screens (the Renewals timeline is wider); as in the CSS
const PANEL_WIDTH = 340;
const WIDE_PANEL_WIDTH = 640;
// Room kept free when zooming to an area, besides the panel: a store or zone card on the right
const CARD_ROOM = 420;
// On a phone the card is a sheet over the bottom of the map instead, about half its height when it opens
const PHONE_SCREEN = 768;
// The closed panel sheet (its icons) along the bottom of the map on smaller screens
const PANEL_BAR_ROOM = 100;

export default function App() {
  const { message: toastMsg, showToast } = useToast();
  const data = useStores(showToast);
  const { stores } = data;
  const { settings, updateSettings } = useSettingsState();
  const mapLayers = useLayers(showToast);
  // Which zones each store is in, across all stores (live or not) and the layers shown on the map
  const coverage = useMemo(() => analyseCoverage(stores, mapLayers.layers), [stores, mapLayers.layers]);
  // Rent per m² against each city's median (all stores), and pin sizes by annual rent
  const benchmarks = useMemo(
    () => rentBenchmarks(stores, settings.rentFlagPercent),
    [stores, settings.rentFlagPercent],
  );
  const { filters, filteredStores, citySummaries, allCities, unclear, showUnclearOnly, showCoverageOnly } = useFilters(
    stores,
    coverage,
    settings,
    linkedView,
  );

  // The panels, the map and the selection
  const narrow = useIsNarrow();
  const [currentTab, setCurrentTab] = useState<SidebarTab>(linkedView.tab);
  // Open or closed as it was left; the first time, open on a large screen and closed on a small one
  const [isPanelOpen, setPanelOpenState] = useState(() => loadPanelOpen() ?? window.innerWidth >= NARROW_SCREEN);
  const setPanelOpen = useCallback((open: boolean) => {
    setPanelOpenState(open);
    savePanelOpen(open);
  }, []);
  // Only the map: no bars, panels, cards or buttons
  const [focusMode, setFocusMode] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // The base map (night mode is the dark one), and the coordinate search's pin
  const [baseMap, setBaseMapState] = useState(() => toBaseMapChoice(loadBaseMap()));
  const updateBaseMap = useCallback((next: (choice: BaseMapChoice) => BaseMapChoice) => {
    setBaseMapState((choice) => {
      const updated = next(choice);
      saveBaseMap(updated);
      return updated;
    });
  }, []);
  const chooseBase = useCallback((id: BaseMapId) => updateBaseMap((c) => chooseBaseMap(c, id)), [updateBaseMap]);
  const switchNight = useCallback(() => updateBaseMap(toggleNight), [updateBaseMap]);
  const [searchPin, setSearchPin] = useState<LatLng | null>(null);
  // The road route from the searched point to the selected store, once worked out
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  // The OpenRouteService key from Settings (this browser only), and where routing says what happened
  const [orsKey, setOrsKeyState] = useState(loadOrsKey);
  const setOrsKey = useCallback((key: string) => {
    setOrsKeyState(key.trim());
    saveOrsKey(key);
  }, []);
  const roadsSetup = useMemo(() => ({ orsKey, notify: showToast }), [orsKey, showToast]);
  const [focusedCity, setFocusedCity] = useState<string | null>(null);
  // A selected map zone; a store and a zone are never selected at the same time, so one card shows
  const [selectedZone, setSelectedZone] = useState<ZoneRef | null>(null);
  const [zoomRequest, setZoomRequest] = useState<ZoomRequest | null>(null);
  // Drawing a new zone or editing a zone's shape; the cards are hidden meanwhile so the map is clear
  const [mapMode, setMapMode] = useState<MapMode | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  // On smaller screens: how much of the bottom of the map the store or zone sheet, and the panel sheet, cover
  const [cardInset, setCardInset] = useState(0);
  const [panelInset, setPanelInset] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  const selectedStore = useMemo(() => stores.find((s) => s.id === selectedId) || null, [stores, selectedId]);
  // The zone's card closes if its layer is hidden or deleted
  const zoneSelection = useMemo(() => {
    const layer = selectedZone && mapLayers.layers.find((l) => l.id === selectedZone.layerId && l.visible);
    const zone = layer && layer.zones.find((z) => z.id === selectedZone.zoneId);
    return layer && zone ? { layer, zone } : null;
  }, [selectedZone, mapLayers.layers]);
  const notOnMap = useMemo(() => filteredStores.filter((s) => !hasCoords(s)).length, [filteredStores]);
  // Every problem in the data, for the Data Quality panel (all stores, whatever the filters)
  const quality = useMemo(() => dataQuality(stores), [stores]);
  // The totals in the top bar, for the stores that pass the filters
  const stats = useMemo(() => kpiStats(filteredStores, settings, settings.includeVat), [filteredStores, settings]);

  // What covers the map: the panel on the left (large screens), the sheets at the bottom (smaller ones)
  const panelShown = isPanelOpen && !focusMode;
  const leftInset = panelShown && !narrow ? (currentTab === "renewals" ? WIDE_PANEL_WIDTH : PANEL_WIDTH) : 0;
  const bottomInset = focusMode ? 0 : Math.max(cardInset, panelInset);

  // A panel's icon opens it, or closes it if it's the one open
  const selectTab = useCallback(
    (tab: SidebarTab) => {
      if (isPanelOpen && currentTab === tab) setPanelOpen(false);
      else {
        setCurrentTab(tab);
        setPanelOpen(true);
      }
    },
    [isPanelOpen, currentTab, setPanelOpen],
  );
  const openPanel = useCallback(
    (tab: SidebarTab) => {
      setCurrentTab(tab);
      setPanelOpen(true);
    },
    [setPanelOpen],
  );
  const closePanel = useCallback(() => setPanelOpen(false), [setPanelOpen]);
  const reopenPanel = useCallback(() => setPanelOpen(true), [setPanelOpen]);

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
    openPanel("stores");
  };

  const openDataQuality = useCallback(() => openPanel("quality"), [openPanel]);

  const showCoverageStores = (filter: CoverageFilter) => {
    showCoverageOnly(filter);
    setFocusedCity(null);
    openPanel("stores");
  };

  const closeStore = useCallback(() => setSelectedId(null), []);
  const selectStore = useCallback((id: number) => {
    setSelectedId(id);
    setSelectedZone(null);
  }, []);
  const selectFromList = useCallback(
    (id: number) => {
      selectStore(id);
      if (window.innerWidth < NARROW_SCREEN) setPanelOpen(false);
    },
    [selectStore, setPanelOpen],
  );

  // The view (filters, tab, selected store) in the page's link, and the linked store selected once loaded
  useUrlState({
    filters,
    currentTab,
    selectedStore,
    stores,
    storesReady: !data.awaitingSheet && stores.length > 0,
    onSelectStore: selectFromList,
    showToast,
  });

  // Zooms to an area, clear of the open panel and of the card that's about to open. On smaller screens the panel
  // sheet closes to its bar when something in it is picked (closesPanel), or stays as it is
  const zoomTo = (
    bounds: ReturnType<typeof zoneBounds>,
    { card, closesPanel }: { card: boolean; closesPanel: boolean },
  ) => {
    if (!bounds) return;
    const wide = window.innerWidth >= NARROW_SCREEN;
    const phone = window.innerWidth < PHONE_SCREEN;
    const sheet = wide ? 0 : closesPanel ? PANEL_BAR_ROOM : panelInset;
    const cardSheet = card && phone ? openingSheetHeight(mapRef.current?.clientHeight ?? window.innerHeight) : 0;
    setZoomRequest({
      id: Date.now(),
      bounds,
      padLeft: leftInset + 40,
      padRight: card && wide ? CARD_ROOM : 40,
      padBottom: Math.max(sheet, cardSheet) + 20 || 60,
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
    if (zone) zoomTo(zoneBounds([zone]), { card: true, closesPanel: true });
    if (!mapLayers.layers.find((l) => l.id === layerId)?.visible) mapLayers.updateLayer(layerId, { visible: true });
    if (window.innerWidth < NARROW_SCREEN) setPanelOpen(false);
  };
  // The same, as a callback that never changes, for the memoised store card
  const selectZoneRef = useRef(selectZoneFromList);
  useEffect(() => {
    selectZoneRef.current = selectZoneFromList;
  });
  const openZone = useCallback((layerId: string, zoneId: string) => selectZoneRef.current(layerId, zoneId), []);

  const importLayers = async (files: File[]) => {
    const added = await mapLayers.importFiles(files);
    zoomTo(zoneBounds(added.flatMap((l) => l.zones)), { card: false, closesPanel: false });
  };

  const openLayers = () => openPanel("layers");

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
    if (window.innerWidth < NARROW_SCREEN) setPanelOpen(false);
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

  // The stores that pass the filters, with their renewal dates and zones worked out
  const exportCsv = () => {
    if (!filteredStores.length) {
      showToast("No stores to export. Clear the filters to export all stores");
      return;
    }
    const filtered = filteredStores.length < stores.length;
    const fileName = csvFileName(filtered, new Date());
    download(fileName, storesToCsv(filteredStores, settings, coverage), "text/csv;charset=utf-8");
    const count = `${filteredStores.length} ${filteredStores.length === 1 ? "store" : "stores"}`;
    showToast(`Saved ${fileName} with ${count}${filtered ? " (the ones that match the filters)" : ""}`);
  };

  const exportLayer = (layer: ZoneLayer) => {
    download(kmlFileName(layer), layerToKml(layer), "application/vnd.google-earth.kml+xml");
    showToast(`Saved ${kmlFileName(layer)}. In My Maps, add a layer and choose Import to bring it in`);
  };

  const zoneCount = mapLayers.layers.reduce((n, l) => n + l.zones.length, 0);
  const layersSummary = `${mapLayers.layers.length} ${mapLayers.layers.length === 1 ? "layer" : "layers"} · ${zoneCount} ${zoneCount === 1 ? "zone" : "zones"}`;

  // Placeholders while a saved Google Sheet loads (not once it has failed: the message says so instead)
  const loadingSheet = data.awaitingSheet && !data.syncError;
  const listEmptyMessage =
    data.awaitingSheet && data.syncError
      ? "Couldn't load the Google Sheet. Use Sync Sheet to try again."
      : "No results found";

  // Keys: F for focus mode, Esc to leave it or to close the panel. Not while typing, in a window over the page, or
  // while drawing or editing a zone (Esc cancels that). Read through a ref, so the listener is added once
  const keyState = useRef({ focusMode, isPanelOpen, busy: false });
  useEffect(() => {
    keyState.current = { focusMode, isPanelOpen, busy: mapMode !== null || isUploadModalOpen || isSettingsOpen };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Something else (a popover closing) has already used the key
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const { focusMode, isPanelOpen, busy } = keyState.current;
      const target = e.target instanceof HTMLElement ? e.target : null;
      const typing = !!target?.closest("input, textarea, select, [contenteditable]:not([contenteditable='false'])");
      const blocked = busy || !!document.querySelector("[data-modal]");
      if (e.key === "Escape") {
        if (focusMode) setFocusMode(false);
        else if (blocked) return;
        else if (typing) target?.blur();
        else if (isPanelOpen) setPanelOpen(false);
      } else if ((e.key === "f" || e.key === "F") && !typing && !blocked && !e.repeat) {
        setFocusMode(!focusMode);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setPanelOpen]);
  const enterFocusMode = useCallback(() => {
    if (!keyState.current.busy) setFocusMode(true);
  }, []);
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), []);
  const { clearError } = data;
  const openUpload = useCallback(() => {
    clearError();
    setIsUploadModalOpen(true);
  }, [clearError]);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);

  const railBadges = useMemo(
    () => ({ renewals: stats.renewals.now, quality: quality.storesWithIssues }),
    [stats.renewals.now, quality.storesWithIssues],
  );
  // Leaflet is told to measure itself again when anything around the map opens or closes
  const layoutKey = `${focusMode}|${panelShown}|${narrow}|${leftInset}`;

  const page = (
    <div
      className={`app-container flex flex-col overflow-hidden bg-[#141414] text-[#EFEFEF] ${focusMode ? "focus-mode" : ""}`}
    >
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onStoresImported={data.importStores}
        onGoogleSheetImport={handleSheetImport}
        isLoading={data.isLoading}
        loadingMsg={data.loadingMsg}
        error={data.error}
      />

      {!focusMode && (
        <TopBar
          sheetId={data.sheetId}
          lastSync={data.lastSync}
          syncError={data.syncError}
          fileName={data.fileName}
          isSyncing={data.isSyncing}
          onUpload={openUpload}
          onSync={data.syncSheet}
          onResetSample={handleResetSample}
          onOpenSettings={openSettings}
          onOpenDataQuality={openDataQuality}
          stats={stats}
          unclear={unclear}
          unclearOnly={filters.unclearOnly}
          onShowUnclear={showUnclearStores}
          issueCount={quality.storesWithIssues}
          onShowIssues={openDataQuality}
          loading={loadingSheet}
          searchOpen={searchOpen}
          onToggleSearch={toggleSearch}
        />
      )}

      <SettingsModal
        isOpen={isSettingsOpen}
        settings={settings}
        onChange={updateSettings}
        onClose={closeSettings}
        orsKey={orsKey}
        onOrsKey={setOrsKey}
      />

      <main className="app-main flex flex-1 min-h-0 relative">
        {!narrow && !focusMode && (
          <NavRail currentTab={currentTab} open={isPanelOpen} badges={railBadges} onSelect={selectTab} />
        )}

        <div
          className={`map-area relative flex-1 min-w-0 min-h-0 ${panelShown && !narrow ? (currentTab === "renewals" ? "panel-open panel-wide" : "panel-open") : ""} ${panelShown && narrow ? "panel-sheet-open" : ""} ${(selectedStore || zoneSelection) && !mapMode ? "card-open" : ""}`}
        >
          <div
            ref={mapRef}
            className={`map-container absolute inset-0 ${cardInset ? "sheet-open" : ""}`}
            style={{ "--sheet-inset": `${bottomInset}px` } as CSSProperties}
            onClick={() => {
              if (selectedId !== null) setSelectedId(null);
            }}
          >
            <MapComponent
              stores={filteredStores}
              benchmarks={benchmarks}
              bottomInset={bottomInset}
              leftInset={leftInset}
              layoutKey={layoutKey}
              selectedId={selectedId}
              onSelectStore={selectStore}
              onMapClick={() => {
                setSelectedId(null);
                setSelectedZone(null);
                setFocusedCity(null);
              }}
              allStores={stores}
              baseMap={baseMap.base}
              onChooseBase={chooseBase}
              onToggleNight={switchNight}
              searchPin={searchPin}
              onSearchPin={setSearchPin}
              onRoute={setRouteInfo}
              focusedCity={focusedCity}
              layers={mapLayers.layers}
              selectedZone={zoneSelection ? selectedZone : null}
              onSelectZone={selectZone}
              onOpenLayers={openLayers}
              pinColors={settings.pinColors}
              onPinColors={(pinColors) => updateSettings({ pinColors })}
              onFocusMode={enterFocusMode}
              searchOpen={searchOpen && !focusMode}
              zoomRequest={zoomRequest}
              cardOpen={selectedId !== null || zoneSelection !== null}
              mapMode={mapMode}
              onDrawn={finishDrawing}
              onEdited={finishEditingShape}
              onCancelMode={() => setMapMode(null)}
              onAddStore={data.addManualStore}
              showToast={showToast}
            />

            <DetailPanel
              store={mapMode ? null : selectedStore}
              stores={stores}
              coverage={coverage}
              benchmark={selectedStore ? (benchmarks.of.get(selectedStore.id) ?? null) : null}
              onSelectZone={openZone}
              onSelectStore={selectStore}
              searchPin={searchPin}
              route={searchPin ? routeInfo : null}
              onClose={closeStore}
              onInset={setCardInset}
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
                onInset={setCardInset}
              />
            )}

            {!focusMode && <MapLegend notOnMap={notOnMap} />}
          </div>

          {!focusMode && (
            <Sidebar
              layout={narrow ? "sheet" : "overlay"}
              isOpen={isPanelOpen}
              onOpen={reopenPanel}
              onClose={closePanel}
              onSelectTab={selectTab}
              onInset={setPanelInset}
              badges={railBadges}
              stores={filteredStores}
              totalStores={stores.length}
              citySummaries={citySummaries}
              currentTab={currentTab}
              setCurrentTab={setCurrentTab}
              selectedId={selectedId}
              onSelectStore={selectFromList}
              onImportSheet={openUpload}
              onExportCsv={exportCsv}
              onCityFocus={(city) => {
                filters.setCityFilter(city);
                setFocusedCity(city);
                if (window.innerWidth < NARROW_SCREEN) setPanelOpen(false);
              }}
              filters={filters}
              allCities={allCities}
              emptyMessage={listEmptyMessage}
              loading={loadingSheet}
              coverage={coverage}
              benchmarks={benchmarks}
              quality={quality}
              cityFigures={<ExtraFigures stats={stats} className="city-figures" />}
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
          )}

          {focusMode && (
            <button
              className="focus-exit flex items-center gap-2 absolute bg-[#111]/90 backdrop-blur-md border border-[#333] hover:border-[#fbbf24] hover:text-[#fbbf24] rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-200 cursor-pointer"
              onClick={() => setFocusMode(false)}
              title="Leave focus mode (F or Esc)"
            >
              <Minimize2 size={15} />
              <span>Exit focus</span>
            </button>
          )}
        </div>
      </main>

      <Toast message={toastMsg} />
    </div>
  );

  // The settings reach the list rows, store card, totals and charts through this, without being passed down
  return (
    <SettingsContext.Provider value={settings}>
      <RoadsContext.Provider value={roadsSetup}>{page}</RoadsContext.Provider>
    </SettingsContext.Provider>
  );
}
