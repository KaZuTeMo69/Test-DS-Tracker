import { useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { PolygonRings, Store, ZoneLayer } from "../types";
import { LatLng } from "../lib/coords";
import AddStoreModal from "./map/AddStoreModal";
import CoordinateSearch from "./map/CoordinateSearch";
import EditBanner from "./map/EditBanner";
import MapControls, { ZoomButtons } from "./map/MapControls";
import MapController, { ZoomRequest } from "./map/MapController";
import SearchPin from "./map/SearchPin";
import StoreMarkers from "./map/StoreMarkers";
import ZoneEditor, { EditorControls, MapMode } from "./map/ZoneEditor";
import ZoneLayers, { ZoneRef } from "./map/ZoneLayers";

interface MapComponentProps {
  stores: Store[];
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  onMapClick?: () => void;
  isNightMode: boolean;
  setIsNightMode: (night: boolean) => void;
  focusedCity?: string | null;
  layers: ZoneLayer[];
  selectedZone: ZoneRef | null;
  onSelectZone: (layerId: string, zoneId: string) => void;
  onOpenLayers: () => void;
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
  selectedId,
  onSelectStore,
  onMapClick,
  isNightMode,
  setIsNightMode,
  focusedCity,
  layers,
  selectedZone,
  onSelectZone,
  onOpenLayers,
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
  const [tempPin, setTempPin] = useState<LatLng | null>(null);
  const [searchInput, setSearchInput] = useState("");
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
    <div id="map" className="w-full h-full relative cursor-default">
      {mapMode ? (
        <EditBanner
          mode={mapMode}
          layerName={modeLayer?.name ?? ""}
          zoneName={modeZone?.name ?? ""}
          onFinish={() => editorRef.current?.finish()}
          onUndo={() => editorRef.current?.undo?.()}
          onCancel={onCancelMode}
        />
      ) : (
        <CoordinateSearch
          value={searchInput}
          onChange={setSearchInput}
          onFound={setTempPin}
          onClear={removePin}
          stepAside={cardOpen}
        />
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
          onMapClick={onMapClick}
          tempPin={tempPin}
          isNightMode={isNightMode}
          routePanelRef={routePanelRef}
          zoomRequest={zoomRequest}
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ZoneLayers
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

        {tempPin && <SearchPin pin={tempPin} onAddStore={() => setShowAddModal(true)} onRemove={removePin} />}

        <StoreMarkers stores={stores} selectedId={selectedId} onSelectStore={onSelectStore} />

        <MapControls
          isNightMode={isNightMode}
          setIsNightMode={setIsNightMode}
          hasLayers={layers.some((l) => l.visible)}
          onOpenLayers={onOpenLayers}
          panelRef={routePanelRef}
        />

        <div className="leaflet-bottom leaflet-right mb-6 mr-6 !z-[1000] pointer-events-none">
          <div className="flex flex-col gap-2 items-end pointer-events-auto">
            <ZoomButtons />
          </div>
        </div>
      </MapContainer>
    </div>
  );
}
