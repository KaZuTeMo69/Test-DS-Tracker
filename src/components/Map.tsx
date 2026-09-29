import { useCallback, useEffect, useRef, useState } from "react";
import { MapContainer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { PolygonRings, Store, ZoneLayer } from "../types";
import { LatLng } from "../lib/coords";
import { BaseMapId } from "../lib/baseMaps";
import { hasCoords } from "../lib/checks";
import { RouteInfo } from "../lib/routing";
import { PinColors } from "../lib/settings";
import { RentBenchmarks } from "../lib/rentStats";
import AddStoreModal from "./map/AddStoreModal";
import CoordinateSearch from "./map/CoordinateSearch";
import EditBanner from "./map/EditBanner";
import BaseMapTiles from "./map/BaseMapTiles";
import MapControls, { ZoomButtons } from "./map/MapControls";
import { MeasureBar, MeasureLayer, useMeasure } from "./map/MeasureTool";
import MapController, { ZoomRequest } from "./map/MapController";
import SearchPin from "./map/SearchPin";
import StoreMarkers from "./map/StoreMarkers";
import ZoneEditor, { EditorControls, MapMode } from "./map/ZoneEditor";
import ZoneLayers, { ZoneRef } from "./map/ZoneLayers";

interface MapComponentProps {
  stores: Store[];
  benchmarks: RentBenchmarks; // pin colours (rent against the city median) and sizes (annual rent)
  bottomInset: number; // the height of the sheet (store card or panels) over the bottom of the map
  leftInset: number; // the width of the open panel over the left of the map, on large screens
  layoutKey: string; // changes when the panels or bars around the map open or close
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  onMapClick?: () => void;
  allStores: Store[]; // whatever the filters: the nearest stores to the searched point
  baseMap: BaseMapId;
  onChooseBase: (base: BaseMapId) => void;
  onToggleNight: () => void;
  // The coordinate search's pin: a candidate site
  searchPin: LatLng | null;
  onSearchPin: (pin: LatLng | null) => void;
  onRoute: (info: RouteInfo | null) => void; // the route from the searched point to the selected store
  focusedCity?: string | null;
  layers: ZoneLayer[];
  selectedZone: ZoneRef | null;
  onSelectZone: (layerId: string, zoneId: string) => void;
  onOpenLayers: () => void;
  pinColors: PinColors;
  onPinColors: (pinColors: PinColors) => void;
  onFocusMode: () => void;
  searchOpen: boolean; // the coordinate search bar, opened and closed from the top bar
  zoomRequest: ZoomRequest | null;
  cardOpen: boolean; // a store or zone card is open (top right)
  // Drawing or editing a zone
  mapMode: MapMode | null;
  onDrawn: (polygons: PolygonRings[]) => void;
  onEdited: (polygons: PolygonRings[]) => void;
  onCancelMode: () => void;
  onAddStore?: (store: Omit<Store, "id">) => void;
  showToast?: (msg: string) => void;
}

export default function MapComponent({
  stores,
  benchmarks,
  bottomInset,
  leftInset,
  layoutKey,
  selectedId,
  onSelectStore,
  onMapClick,
  allStores,
  baseMap,
  onChooseBase,
  onToggleNight,
  searchPin: tempPin,
  onSearchPin: setTempPin,
  onRoute,
  focusedCity,
  layers,
  selectedZone,
  onSelectZone,
  onOpenLayers,
  pinColors,
  onPinColors,
  onFocusMode,
  searchOpen,
  zoomRequest,
  cardOpen,
  mapMode,
  onDrawn,
  onEdited,
  onCancelMode,
  onAddStore,
  showToast,
}: MapComponentProps) {
  // The route's directions panel is placed here, under the map buttons
  const routePanelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorControls | null>(null);
  const modeLayer = mapMode ? layers.find((l) => l.id === mapMode.layerId) : undefined;
  const modeZone = mapMode?.kind === "edit" ? modeLayer?.zones.find((z) => z.id === mapMode.zoneId) : undefined;

  // Coordinate search and manual store adding
  const [searchInput, setSearchInput] = useState("");

  // Measuring road distances between two points
  const measure = useMeasure();
  // While measuring, a store's pin is a point to measure from or to, not a store to open
  const { active: measuring, add: addMeasurePoint } = measure;
  const clickStore = useCallback(
    (id: number) => {
      const store = allStores.find((s) => s.id === id);
      if (!measuring) onSelectStore(id);
      else if (store && hasCoords(store)) addMeasurePoint({ lat: store.lat!, lng: store.lng!, label: store.name });
    },
    [measuring, addMeasurePoint, allStores, onSelectStore],
  );
  // Drawing a zone and measuring don't mix: starting one stops the other
  const { stop: stopMeasuring } = measure;
  useEffect(() => {
    if (mapMode) stopMeasuring();
  }, [mapMode, stopMeasuring]);
  const [showAddModal, setShowAddModal] = useState(false);

  const removePin = () => {
    setTempPin(null);
    setSearchInput("");
  };

  const saveManualStore = (name: string, city: string) => {
    if (!tempPin) return;

    // Only the name, city and pin are known; everything else stays blank and is flagged as missing
    const newStore: Omit<Store, "id"> = {
      dsCode: "MANUAL",
      contractDuration: "",
      name,
      country: "KSA",
      city,
      size: null,
      lat: tempPin.lat,
      lng: tempPin.lng,
      startDate: "",
      endDate: "",
      rentSARAnnual: null,
      rentSARMonthly: null,
      rentSARsqm: null,
      live: "",
      paid: "",
    };

    if (onAddStore) {
      onAddStore(newStore);
    }

    setShowAddModal(false);
    removePin();

    if (showToast) {
      showToast(`Manual store "${newStore.name}" added successfully.`);
    }
  };

  return (
    <div id="map" className={`w-full h-full relative cursor-default ${measuring ? "measuring" : ""}`}>
      {measuring ? (
        <MeasureBar measure={measure} />
      ) : mapMode ? (
        <EditBanner
          mode={mapMode}
          layerName={modeLayer?.name ?? ""}
          zoneName={modeZone?.name ?? ""}
          onFinish={() => editorRef.current?.finish()}
          onUndo={() => editorRef.current?.undo?.()}
          onCancel={onCancelMode}
        />
      ) : (
        searchOpen && (
          <CoordinateSearch
            value={searchInput}
            onChange={setSearchInput}
            onFound={setTempPin}
            onClear={removePin}
            stepAside={cardOpen}
            autoFocus={!tempPin}
          />
        )
      )}

      {showAddModal && tempPin && (
        <AddStoreModal pin={tempPin} onCancel={() => setShowAddModal(false)} onSave={saveManualStore} />
      )}

      <MapContainer
        center={[24.7136, 46.6753]}
        zoom={6}
        scrollWheelZoom={true}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapController
          stores={stores}
          selectedId={selectedId}
          focusedCity={focusedCity}
          onMapClick={measuring ? undefined : onMapClick}
          tempPin={tempPin}
          routePanelRef={routePanelRef}
          onRoute={onRoute}
          zoomRequest={zoomRequest}
          bottomInset={bottomInset}
          leftInset={leftInset}
          layoutKey={layoutKey}
        />

        <BaseMapTiles base={baseMap} />

        <ZoneLayers
          key={measuring ? "measuring" : "selecting"}
          interactive={!measuring}
          layers={layers}
          selected={selectedZone}
          onSelect={onSelectZone}
          hiddenZoneId={mapMode?.kind === "edit" ? mapMode.zoneId : undefined}
        />
        <ZoneEditor
          mode={mapMode}
          controlsRef={editorRef}
          onDrawn={onDrawn}
          onEdited={onEdited}
          onCancel={onCancelMode}
          onProblem={(msg) => showToast?.(msg)}
        />

        {tempPin && (
          <SearchPin
            pin={tempPin}
            stores={allStores}
            measuring={measuring}
            onMeasurePoint={addMeasurePoint}
            onSelectStore={onSelectStore}
            selectedId={selectedId}
            onAddStore={() => setShowAddModal(true)}
            onRemove={removePin}
          />
        )}

        <StoreMarkers
          stores={stores}
          benchmarks={benchmarks}
          selectedId={selectedId}
          onSelectStore={clickStore}
          measuring={measuring}
        />

        <MeasureLayer measure={measure} />

        <MapControls
          base={baseMap}
          onChooseBase={onChooseBase}
          onToggleNight={onToggleNight}
          measuring={measuring}
          onMeasure={measure.toggle}
          measureDisabled={mapMode !== null}
          hasLayers={layers.some((l) => l.visible)}
          onOpenLayers={onOpenLayers}
          pinColors={pinColors}
          onPinColors={onPinColors}
          onFocusMode={onFocusMode}
          panelRef={routePanelRef}
        />

        <div className="leaflet-bottom leaflet-right mb-6 mr-6 !z-[1000] pointer-events-none map-zoom-buttons">
          <div className="flex flex-col gap-2 items-end pointer-events-auto">
            <ZoomButtons />
          </div>
        </div>
      </MapContainer>
    </div>
  );
}
