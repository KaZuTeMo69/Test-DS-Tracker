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
import CoordinateSearch from "./map/CoordinateSearch";
import EditBanner from "./map/EditBanner";
import BaseMapTiles from "./map/BaseMapTiles";
import MapControls, { ZoomButtons } from "./map/MapControls";
import { MeasureBar, MeasureLayer, useMeasure } from "./map/MeasureTool";
import MapController, { ZoomRequest } from "./map/MapController";
import PlaceBanner from "./map/PlaceBanner";
import PotentialMarkers, { PotentialFormPin } from "./map/PotentialMarkers";
import { Potential } from "../lib/potentials";
import SearchPin from "./map/SearchPin";
import StoreMarkers, { OrderColours } from "./map/StoreMarkers";
import ZoneEditor, { EditorControls, MapMode } from "./map/ZoneEditor";
import ZoneLayers, { ZoneRef } from "./map/ZoneLayers";

interface MapComponentProps {
  stores: Store[];
  benchmarks: RentBenchmarks; // pin colours (rent against the city median) and sizes (annual rent)
  orders: OrderColours; // pin colours by OPD quartile or CPO against the city median
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
  // Potentials: their pins, the one selected, and adding one (placing it, then its form's draggable pin)
  potentials: Potential[];
  draftPotentialIds: Set<string>; // the ones added in the app, not in the sheet yet
  selectedPotentialId: string | null;
  onSelectPotential: (id: string) => void;
  placingPotential: boolean; // the next map click puts the new Potential there
  formPin: { lat: number; lng: number; color: string } | null; // the Potential being added or edited
  onFormPoint: (lat: number, lng: number) => void; // placing it, or moving the form's pin
  onCancelPlacing: () => void;
  onAddPotentialAt: (point: LatLng) => void; // from the searched point's popup
  showToast?: (msg: string) => void;
}

export default function MapComponent({
  stores,
  benchmarks,
  orders,
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
  potentials,
  draftPotentialIds,
  selectedPotentialId,
  onSelectPotential,
  placingPotential,
  formPin,
  onFormPoint,
  onCancelPlacing,
  onAddPotentialAt,
  showToast,
}: MapComponentProps) {
  // The route's directions panel is placed here, under the map buttons
  const routePanelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorControls | null>(null);
  const modeLayer = mapMode ? layers.find((l) => l.id === mapMode.layerId) : undefined;
  const modeZone = mapMode?.kind === "edit" ? modeLayer?.zones.find((z) => z.id === mapMode.zoneId) : undefined;

  // Coordinate search
  const [searchInput, setSearchInput] = useState("");

  // Measuring road distances between two points
  const measure = useMeasure();
  // While measuring, a store's pin is a point to measure from or to, not a store to open
  const { active: measuring, add: addMeasurePoint } = measure;

  // Drawing a zone, placing a Potential and measuring don't mix: starting one stops the others
  const { stop: stopMeasuring } = measure;
  const addingPotential = placingPotential || formPin !== null;
  // While a Potential is placed, a click on a store's pin puts it there too, rather than opening the store.
  // onFormPoint is read through a ref: it changes on every render, and a new click handler would redraw every pin
  const formPointRef = useRef(onFormPoint);
  useEffect(() => {
    formPointRef.current = onFormPoint;
  });
  const clickStore = useCallback(
    (id: number) => {
      const store = allStores.find((s) => s.id === id);
      const at = store && hasCoords(store) ? { lat: store.lat!, lng: store.lng! } : null;
      if (addingPotential) {
        if (at) formPointRef.current(at.lat, at.lng);
      } else if (!measuring) onSelectStore(id);
      else if (at) addMeasurePoint({ ...at, label: store!.name });
    },
    [measuring, addingPotential, addMeasurePoint, allStores, onSelectStore],
  );
  // A Potential's pin: a point to measure from or to while measuring, otherwise its card
  const clickPotential = useCallback(
    (p: Potential) => {
      if (addingPotential) return;
      if (measuring) addMeasurePoint({ lat: p.lat, lng: p.lng, label: p.name });
      else onSelectPotential(p.id);
    },
    [measuring, addingPotential, addMeasurePoint, onSelectPotential],
  );
  useEffect(() => {
    if (mapMode || addingPotential) stopMeasuring();
  }, [mapMode, addingPotential, stopMeasuring]);

  const removePin = () => {
    setTempPin(null);
    setSearchInput("");
  };

  return (
    <div
      id="map"
      className={`w-full h-full relative cursor-default ${measuring || placingPotential ? "measuring" : ""}`}
    >
      {measuring ? (
        <MeasureBar measure={measure} />
      ) : placingPotential ? (
        <PlaceBanner onCancel={onCancelPlacing} />
      ) : formPin ? null : mapMode ? (
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
          onMapClick={measuring || addingPotential ? undefined : onMapClick}
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
          key={measuring || addingPotential ? "measuring" : "selecting"}
          interactive={!measuring && !addingPotential}
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
            onAddPotential={() => onAddPotentialAt(tempPin)}
            onRemove={removePin}
          />
        )}

        <StoreMarkers
          stores={stores}
          benchmarks={benchmarks}
          orders={orders}
          selectedId={selectedId}
          onSelectStore={clickStore}
          measuring={measuring}
        />

        <PotentialMarkers
          potentials={potentials}
          draftIds={draftPotentialIds}
          selectedId={selectedPotentialId}
          onClick={clickPotential}
        />

        {addingPotential && (
          <PotentialFormPin position={formPin} color={formPin?.color ?? "#fbbf24"} onMove={onFormPoint} />
        )}

        <MeasureLayer measure={measure} />

        <MapControls
          base={baseMap}
          onChooseBase={onChooseBase}
          onToggleNight={onToggleNight}
          measuring={measuring}
          onMeasure={measure.toggle}
          measureDisabled={mapMode !== null || addingPotential}
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
