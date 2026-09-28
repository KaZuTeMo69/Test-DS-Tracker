import { useRef, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Store } from "../types";
import { LatLng } from "../lib/coords";
import AddStoreModal from "./map/AddStoreModal";
import CoordinateSearch from "./map/CoordinateSearch";
import MapControls, { ZoomButtons } from "./map/MapControls";
import MapController from "./map/MapController";
import RawLayer from "./map/RawLayer";
import SearchPin from "./map/SearchPin";
import StoreMarkers from "./map/StoreMarkers";

interface MapComponentProps {
  stores: Store[];
  selectedId: number | null;
  onSelectStore: (id: number) => void;
  onMapClick?: () => void;
  isNightMode: boolean;
  setIsNightMode: (night: boolean) => void;
  focusedCity?: string | null;
  kmlLayers: L.Layer[];
  setKmlLayers: (layers: L.Layer[]) => void;
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
  kmlLayers,
  setKmlLayers,
  onAddStore,
  showToast,
}: MapComponentProps) {
  // The route's directions panel is placed here, under the map buttons
  const routePanelRef = useRef<HTMLDivElement>(null);

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
      <CoordinateSearch
        value={searchInput}
        onChange={setSearchInput}
        onFound={setTempPin}
        onClear={removePin}
        stepAside={selectedId !== null}
      />

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
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {kmlLayers.map((layer, idx) => (
          <RawLayer key={`kml-${idx}`} layer={layer} />
        ))}

        {tempPin && <SearchPin pin={tempPin} onAddStore={() => setShowAddModal(true)} onRemove={removePin} />}

        <StoreMarkers stores={stores} selectedId={selectedId} onSelectStore={onSelectStore} />

        <MapControls
          isNightMode={isNightMode}
          setIsNightMode={setIsNightMode}
          hasKml={kmlLayers.length > 0}
          onKmlLoaded={setKmlLayers}
          onClearKml={() => setKmlLayers([])}
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
