import React, { useEffect, useRef, useState, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { Store } from "../types";
import { pinColor, PIN_SEL, isLive, isPaid } from "../constants";
import { Moon, Sun, FileUp, X, Search } from "lucide-react";
import { parseKML } from "../lib/kml";

// Fix for default marker icons in Leaflet
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// 1. Declare a reference to hold the active route control at the top of your component script
let activeRoutingControl: any = null;

// 2. Create a reusable function to draw routes when a store is selected
export function calculateRouteToStore(userLat: number, userLng: number, storeLat: number, storeLng: number, mapInstance: L.Map) {
  // Clear any existing route from a previous search so they don't pile up on screen
  if (activeRoutingControl) {
    try {
      mapInstance.removeControl(activeRoutingControl);
    } catch (e) {
      console.warn("Error removing routing control", e);
    }
    activeRoutingControl = null;
  }

  // Check if Routing is available on L
  if (!(L as any).Routing || !(L as any).Routing.control) {
    console.warn("Leaflet Routing Machine is not yet loaded.");
    return;
  }

  // Initialize the Leaflet Routing Machine control pointing to the public OSRM server
  try {
    activeRoutingControl = (L as any).Routing.control({
      waypoints: [
        L.latLng(userLat, userLng),   // Start Point (e.g., your searched/dropped coordinate sandbox pin)
        L.latLng(storeLat, storeLng)  // End Point (The target dark store location coordinate)
      ],
      router: (L as any).Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1' // Public OSRM Backend API
      }),
      lineOptions: {
        styles: [{ color: '#38BDF8', weight: 5, opacity: 0.85 }] // Modern sky-blue route path line
      },
      createMarker: function() { return null; }, // Hides default flags so your custom store pins stay visible!
      show: true, // Displays an interactive step-by-step driving itinerary panel on the map
    }).addTo(mapInstance);
  } catch (error) {
    console.error("Failed to initialize Leaflet Routing control", error);
  }
}

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
  onAddStore?: (store: Omit<Store, 'id'>) => void;
  showToast?: (msg: string) => void;
}

function makeIcon(color: string, selected = false) {
  const sz = selected ? 38 : 30;
  const h = Math.round(sz * 1.35);
  const innerR = selected ? 6 : 4.5;
  
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${h}" viewBox="0 0 24 32">
      <defs>
        <filter id="pin-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
          <feOffset dx="0" dy="1.5" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${selected ? `<circle cx="12" cy="12" r="10" fill="${color}" opacity="0.25" />` : ""}
      <path filter="url(#pin-shadow)" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="${color}"/>
      <circle cx="12" cy="12" r="${innerR}" fill="white"/>
    </svg>
  `;
  
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [sz, h],
    iconAnchor: [sz / 2, h],
    popupAnchor: [0, -h],
  });
}

function parseDMSToDecimal(input: string): { lat: number; lng: number } | null {
  const dmsRegex = /(\d+(?:\.\d+)?)\s*[°Dd\s]?\s*(?:(\d+(?:\.\d+)?)\s*['′Mm\s]?\s*(?:(\d+(?:\.\d+)?)\s*["″”sS]?)?)?\s*([NSEWnsew])/gi;
  const matches = [...input.matchAll(dmsRegex)];
  
  if (matches.length !== 2) {
    return null;
  }
  
  const results = matches.map(match => {
    const degrees = parseFloat(match[1]);
    const minutes = match[2] ? parseFloat(match[2]) : 0;
    const seconds = match[3] ? parseFloat(match[3]) : 0;
    const direction = match[4].toUpperCase();
    
    let decimal = degrees + (minutes / 60) + (seconds / 3600);
    if (direction === "S" || direction === "W") {
      decimal = -decimal;
    }
    return { decimal, direction };
  });
  
  const latMatch = results.find(r => r.direction === "N" || r.direction === "S");
  const lngMatch = results.find(r => r.direction === "E" || r.direction === "W");
  
  if (latMatch && lngMatch) {
    return { lat: latMatch.decimal, lng: lngMatch.decimal };
  }
  
  return { lat: results[0].decimal, lng: results[1].decimal };
}

function MapUpdater({ 
  stores, 
  selectedId, 
  focusedCity, 
  onMapClick,
  tempPin,
  isNightMode,
  routingLoaded
}: { 
  stores: Store[], 
  selectedId: number | null, 
  focusedCity?: string | null, 
  onMapClick?: () => void,
  tempPin: { lat: number; lng: number } | null,
  isNightMode: boolean,
  routingLoaded: boolean
}) {
  const map = useMap();
  
  useEffect(() => {
    if (!map) return;
    const tilePane = map.getPane('tilePane') || map.getContainer().querySelector('.leaflet-tile-pane');
    if (tilePane) {
      if (isNightMode) {
        tilePane.classList.add('night-map-tiles');
      } else {
        tilePane.classList.remove('night-map-tiles');
      }
    }
  }, [map, isNightMode]);
  
  useMapEvents({
    click: () => {
      if (onMapClick) onMapClick();
    },
  });
  const storesWithCoords = useMemo(() => stores.filter(s => s.lat !== null && s.lng !== null), [stores]);
  // Re-fit only when the set of pins changes, so a background refresh with the same
  // data doesn't throw away the user's current zoom and position
  const pinsKey = useMemo(() => storesWithCoords.map(s => `${s.id}:${s.lat},${s.lng}`).join("|"), [storesWithCoords]);
  const selectedStore = selectedId === null ? undefined : stores.find(s => s.id === selectedId);
  const selectedLat = selectedStore?.lat ?? null;
  const selectedLng = selectedStore?.lng ?? null;
  
  useEffect(() => {
    // Small delay to ensure container is ready
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!map || !map.getContainer()) return;
    if (tempPin) {
      try {
        map.setView([tempPin.lat, tempPin.lng], 14, { animate: true });
      } catch (e) {
        console.warn("setView to tempPin failed", e);
      }
    } else if (focusedCity) {
      const cityStores = storesWithCoords.filter(s => s.city === focusedCity);
      if (cityStores.length > 0) {
        try {
          const bounds = L.latLngBounds(cityStores.map(s => [s.lat!, s.lng!]));
          map.fitBounds(bounds, { padding: [80, 80] });
        } catch (e) {
          console.warn("fitBounds failed", e);
        }
      }
    } else if (storesWithCoords.length > 0) {
      try {
        const bounds = L.latLngBounds(storesWithCoords.map(s => [s.lat!, s.lng!]));
        map.fitBounds(bounds, { padding: [60, 60] });
      } catch (e) {
        console.warn("fitBounds failed", e);
      }
    }
  }, [map, pinsKey, focusedCity, tempPin]);

  useEffect(() => {
    if (!map || !map.getContainer() || selectedLat === null || selectedLng === null) return;
    try {
      map.setView([selectedLat, selectedLng], Math.max(map.getZoom(), 14), { animate: true });
    } catch (e) {
      console.warn("setView failed", e);
    }
  }, [selectedId, map, selectedLat, selectedLng]);

  useEffect(() => {
    if (!map) return;
    if (tempPin && selectedId !== null && routingLoaded) {
      const store = stores.find(s => s.id === selectedId);
      if (store && store.lat !== null && store.lng !== null) {
        calculateRouteToStore(tempPin.lat, tempPin.lng, store.lat, store.lng, map);
      }
    } else {
      if (activeRoutingControl) {
        try {
          map.removeControl(activeRoutingControl);
        } catch (e) {
          console.warn("removeControl failed", e);
        }
        activeRoutingControl = null;
      }
    }
  }, [selectedId, tempPin, map, stores, routingLoaded]);

  useEffect(() => {
    return () => {
      if (activeRoutingControl && map) {
        try {
          map.removeControl(activeRoutingControl);
        } catch (e) {
          // ignore
        }
        activeRoutingControl = null;
      }
    };
  }, [map]);

  return null;
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
  showToast
}: MapComponentProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [routingLoaded, setRoutingLoaded] = useState(false);

  useEffect(() => {
    (window as any).L = L;

    if ((L as any).Routing && (L as any).Routing.control) {
      setRoutingLoaded(true);
      return;
    }

    const scriptId = "leaflet-routing-machine-script";
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js";
      script.async = true;
      document.body.appendChild(script);
    }

    const onScriptLoad = () => {
      setRoutingLoaded(true);
    };

    script.addEventListener("load", onScriptLoad);
    return () => {
      if (script) {
        script.removeEventListener("load", onScriptLoad);
      }
    };
  }, []);

  // States for coordinate search and manual store adding
  const [tempPin, setTempPin] = useState<{ lat: number; lng: number } | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchError, setSearchError] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [newStoreName, setNewStoreName] = useState("");
  const [newStoreCity, setNewStoreCity] = useState("");

  const tempMarkerRef = useRef<L.Marker | null>(null);

  // Automatically open the popup when a coordinate search places the temporary marker
  useEffect(() => {
    if (tempPin) {
      const timer = setTimeout(() => {
        if (tempMarkerRef.current) {
          tempMarkerRef.current.openPopup();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [tempPin]);

  const handleKmlUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      try {
        const layers = parseKML(text);
        if (layers.length === 0) {
          alert("No usable polygons or lines found in KML");
          return;
        }
        setKmlLayers(layers);
      } catch (err) {
        console.error("KML Parse error", err);
        alert("Failed to parse KML file");
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // reset for next upload
  };

  const clearKML = () => {
    setKmlLayers([]);
  };

  const handleSearchCoords = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchError("");
    const trimmed = searchInput.trim();
    if (!trimmed) return;

    // Detect if input contains DMS symbols or hemisphere direction letters
    const isDMS = /[°'"′″”nsewNSEW]/.test(trimmed);
    if (isDMS) {
      const parsed = parseDMSToDecimal(trimmed);
      if (parsed) {
        const { lat, lng } = parsed;
        if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
          setTempPin({ lat, lng });
        } else {
          setSearchError("Parsed coordinates are out of valid bounds. Lat [-90, 90], Lng [-180, 180].");
        }
      } else {
        setSearchError("Invalid DMS format. Try: 27°33'15.5\"N 41°42'18.1\"E");
      }
      return;
    }

    // Default to Decimal Degrees coordinates: handles format like "24.7136, 46.6753" or "24.7136 46.6753"
    let parts = trimmed.split(",");
    if (parts.length < 2) {
      parts = trimmed.split(/[\s]+/);
    }

    if (parts.length >= 2) {
      const lat = parseFloat(parts[0].trim());
      const lng = parseFloat(parts[1].trim());

      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        setTempPin({ lat, lng });
      } else {
        setSearchError("Invalid coordinates. Latitude [-90, 90], Longitude [-180, 180].");
      }
    } else {
      setSearchError("Please enter coordinates as Lat, Lng (or DMS).");
    }
  };

  const handleSaveNewStore = () => {
    if (!newStoreName.trim()) {
      alert("Please enter a store name.");
      return;
    }
    if (!newStoreCity.trim()) {
      alert("Please enter a city.");
      return;
    }
    if (!tempPin) return;

    // Only the name, city and pin are known; everything else stays blank and is flagged as missing
    const newStore: Omit<Store, 'id'> = {
      dsCode: "MANUAL",
      whCode: "",
      name: newStoreName.trim(),
      country: "KSA",
      city: newStoreCity.trim(),
      rentUSDAnnual: null,
      rentUSDMonthly: null,
      size: null,
      lat: tempPin.lat,
      lng: tempPin.lng,
      rentAEDAnnual: null,
      rentAEDMonthly: null,
      rentAEDsqm: null,
      startDate: "",
      endDate: "",
      rentSARAnnual: null,
      rentSARMonthly: null,
      rentSARsqm: null,
      live: "",
      paid: ""
    };

    if (onAddStore) {
      onAddStore(newStore);
    }

    setShowAddModal(false);
    setTempPin(null);
    setSearchInput("");
    setNewStoreName("");
    setNewStoreCity("");

    if (showToast) {
      showToast(`Manual store "${newStore.name}" added successfully.`);
    }
  };

  return (
    <div id="map" className="w-full h-full relative cursor-default">
      {/* Floating Coordinate Search Bar */}
      <div 
        className="absolute top-4 left-1/2 -translate-x-1/2 sm:w-[340px] w-[220px] max-w-[90vw] z-[1000] pointer-events-auto transition-all duration-300"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSearchCoords} className="flex flex-col gap-1.5">
          <div className="flex items-center bg-[#111111]/90 backdrop-blur-md border border-[#333] hover:border-gray-500 rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all overflow-hidden">
            <Search size={15} className="text-gray-400 mr-1.5 sm:mr-2 shrink-0" />
            <input 
              type="text"
              placeholder="Search coordinates..."
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                if (searchError) setSearchError("");
              }}
              className="flex-1 bg-transparent text-[11px] sm:text-xs text-white border-none outline-none font-sans placeholder:text-gray-600 pr-1.5 sm:pr-2 h-7 sm:h-8 min-w-0"
              title="Enter Lat, Lng coordinates, e.g., 24.7136, 46.6753"
            />
            {searchInput && (
              <button 
                type="button" 
                onClick={() => { setSearchInput(""); setTempPin(null); setSearchError(""); }}
                className="p-1 text-gray-500 hover:text-white transition-colors cursor-pointer shrink-0"
              >
                <X size={13} />
              </button>
            )}
            <button 
              type="submit"
              className="bg-[#fbbf24] hover:opacity-90 text-black text-[9px] sm:text-[10px] font-black uppercase tracking-wider px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg ml-0.5 sm:ml-1 shrink-0 cursor-pointer active:scale-95 transition-transform"
            >
              Go
            </button>
          </div>
          {searchError && (
            <div className="text-[10px] font-bold text-red-500 whitespace-nowrap bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg text-center shadow-lg animate-in fade-in slide-in-from-top-1 duration-200">
              {searchError}
            </div>
          )}
        </form>
      </div>

      {/* Manual Store Modal */}
      {showAddModal && tempPin && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <div className="bg-[#111111] border border-[#333] rounded-2xl p-6 w-[400px] max-w-[90vw] shadow-[0_20px_50px_rgba(0,0,0,0.6)] animate-in fade-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
              <h3 className="text-sm font-black font-sans text-[#fbbf24] uppercase tracking-wider">Add Manual Store</h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
                type="button"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Store Name</label>
                <input 
                  type="text"
                  className="w-full bg-[#1c1c1c] border border-[#333] rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-[#fbbf24] transition-colors font-sans"
                  placeholder="e.g. Al Yasmin Express"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">City</label>
                <input 
                  type="text"
                  className="w-full bg-[#1c1c1c] border border-[#333] rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-[#fbbf24] transition-colors font-sans"
                  placeholder="e.g. Riyadh"
                  value={newStoreCity}
                  onChange={(e) => setNewStoreCity(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Location Coordinates</label>
                <div className="font-mono text-xs text-gray-400 bg-white/5 px-3 py-2 rounded-lg border border-white/5">
                  {tempPin.lat.toFixed(6)}, {tempPin.lng.toFixed(6)}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddModal(false)}
                className="flex-1 py-3 bg-[#1c1c1c] border border-[#333] text-gray-300 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white/5 cursor-pointer"
                type="button"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveNewStore}
                className="flex-1 py-3 bg-[#fbbf24] text-black rounded-lg text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-transform cursor-pointer"
                type="button"
              >
                Save Store
              </button>
            </div>
          </div>
        </div>
      )}

      <MapContainer
        center={[24.7136, 46.6753]}
        zoom={6}
        scrollWheelZoom={true}
        className="w-full h-full"
        zoomControl={false}
      >
        <MapUpdater 
          stores={stores} 
          selectedId={selectedId} 
          focusedCity={focusedCity} 
          onMapClick={onMapClick} 
          tempPin={tempPin} 
          isNightMode={isNightMode}
          routingLoaded={routingLoaded}
        />
        
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {kmlLayers.map((layer, idx) => (
          <RawLayer key={`kml-${idx}`} layer={layer} />
        ))}

        {tempPin && (
          <Marker
            position={[tempPin.lat, tempPin.lng]}
            icon={makeIcon("#FF5722", true)}
            ref={tempMarkerRef}
          >
            <Popup closeButton={false} maxWidth={280}>
              <div className="map-popup-container p-4 flex flex-col gap-3 bg-[#111] rounded-xl text-white">
                <div className="text-center">
                  <div className="text-xs font-black text-[#FF5722] uppercase tracking-wider mb-1 font-sans">Coordinates Found</div>
                  <div className="font-mono text-xs text-gray-300 bg-white/5 py-1 px-2 rounded border border-white/5">
                    {tempPin.lat.toFixed(5)}, {tempPin.lng.toFixed(5)}
                  </div>
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setNewStoreName("");
                      setNewStoreCity("");
                      setShowAddModal(true);
                    }}
                    className="w-full bg-[#fbbf24] text-black border-none rounded-lg py-2.5 font-extrabold cursor-pointer hover:opacity-90 transform active:scale-95 transition-all text-[11px] uppercase tracking-wider"
                  >
                    Add Store to List ✚
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setTempPin(null);
                      setSearchInput("");
                    }}
                    className="w-full bg-red-400/10 hover:bg-red-400/20 text-red-400 border border-red-500/10 rounded-lg py-2 font-extrabold cursor-pointer transform active:scale-95 transition-all text-[11px] uppercase tracking-wider"
                  >
                    Remove Pin ✖
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        <MarkerClusterGroup
          key={`${isNightMode ? "night" : "day"}-${stores.length}-${selectedId || "none"}`}
          chunkedLoading
          spiderfyOnMaxZoom={true}
          showCoverageOnHover={false}
          iconCreateFunction={(cluster) => {
            const count = cluster.getChildCount();
            return L.divIcon({
              html: `<div class="bg-[#fbbf24] text-black rounded-full w-8 h-8 flex items-center justify-center font-black border-2 border-black/20 shadow-[0_0_15px_rgba(251,191,36,0.3)]">${count}</div>`,
              className: "custom-marker-cluster",
              iconSize: L.point(32, 32),
            });
          }}
        >
          {stores.map((s) => {
            if (s.lat === null || s.lng === null) return null;
            const isSelected = selectedId === s.id;
            return (
              <Marker
                key={`marker-${s.id}-${isSelected}`}
                position={[s.lat, s.lng]}
                icon={makeIcon(isSelected ? PIN_SEL : pinColor(s), isSelected)}
                eventHandlers={{
                  click: () => onSelectStore(s.id)
                }}
                zIndexOffset={isSelected ? 1000 : 0}
              >
                <Popup closeButton={false} maxWidth={220}>
                  <div className="map-popup-container p-4 flex flex-col gap-3 bg-[#111] rounded-xl">
                    <div className="flex gap-2 text-center justify-center">
                      <span className={`map-popup-tag-live px-2 py-0.5 rounded-md ${isLive(s) ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"}`}>
                        {isLive(s) ? "LIVE" : "NOT LIVE"}
                      </span>
                      <span className={`map-popup-tag-paid px-2 py-0.5 rounded-md ${isPaid(s) ? "bg-yellow-500/10 text-yellow-400" : "bg-orange-500/10 text-orange-400"}`}>
                        {isPaid(s) ? "PAID" : "UNPAID"}
                      </span>
                    </div>
                    <div className="text-center">
                      <div className="map-popup-title text-sm font-extrabold text-white mb-0.5">{s.name}</div>
                      <div className="map-popup-subtext text-[10px] text-gray-400 mt-1">{s.dsCode || s.whCode} · {s.city}</div>
                    </div>
                    <button 
                      onClick={() => onSelectStore(s.id)}
                      className="map-popup-btn w-full bg-[#fbbf24] text-black border-none rounded-lg py-2.5 font-extrabold cursor-pointer hover:opacity-90 shadow-md transform active:scale-95 transition-all"
                    >
                      View Details →
                    </button>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MarkerClusterGroup>

        {/* Map Feature Controls Overlay */}
        <div className="leaflet-top leaflet-right mt-4 mr-4 !z-[1000] pointer-events-none">
          <div className="flex flex-col gap-2 items-end pointer-events-auto">
            <button 
              onClick={(e) => { e.stopPropagation(); setIsNightMode(!isNightMode); }}
              className={`flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer ${!isNightMode ? "bg-[#fbbf24] text-black border-[#fbbf24]" : "text-[#EFEFEF] hover:bg-[#222]"}`}
              title={isNightMode ? "Switch to Day Map" : "Switch to Night Map"}
            >
              {isNightMode ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            <button 
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className={`flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer ${kmlLayers.length > 0 ? "border-[#4ade80] text-[#4ade80]" : "text-[#EFEFEF] hover:bg-[#222]"}`}
              title="Load KML Area"
            >
              <FileUp size={18} />
            </button>

            {kmlLayers.length > 0 && (
              <button 
                onClick={(e) => { e.stopPropagation(); clearKML(); }}
                className="flex items-center justify-center w-10 h-10 bg-[#111]/90 backdrop-blur-md border border-[#333] rounded-lg shadow-2xl transition-all cursor-pointer text-[#f87171] hover:bg-[#222]"
                title="Clear KML"
              >
                <X size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="leaflet-bottom leaflet-right mb-6 mr-6 !z-[1000] pointer-events-none">
          <div className="flex flex-col gap-2 items-end pointer-events-auto">
            <ZoomButtons />
          </div>
        </div>
      </MapContainer>

      <input 
        type="file" 
        ref={fileInputRef} 
        className="hidden" 
        accept=".kml" 
        onChange={handleKmlUpload} 
      />
    </div>
  );
}

function ZoomButtons() {
  const map = useMap();
  return (
    <>
      <button 
        className="bg-[#1e1e1e]/90 backdrop-blur-md border border-[#383838] hover:bg-[#252525] w-[40px] h-[40px] flex items-center justify-center text-[#EFEFEF] rounded-t-lg cursor-pointer text-xl font-bold"
        onClick={(e) => { e.stopPropagation(); map.zoomIn(); }} 
        title="Zoom In"
      >
        +
      </button>
      <button 
        className="bg-[#1e1e1e]/90 backdrop-blur-md border border-[#383838] border-t-0 hover:bg-[#252525] w-[40px] h-[40px] flex items-center justify-center text-[#EFEFEF] rounded-b-lg cursor-pointer text-xl font-bold"
        onClick={(e) => { e.stopPropagation(); map.zoomOut(); }}
        title="Zoom Out"
      >
        -
      </button>
    </>
  );
}

function RawLayer({ layer }: { layer: L.Layer; key?: string }) {
  const map = useMap();
  useEffect(() => {
    if (layer) {
      layer.addTo(map);
      return () => {
        layer.remove();
      };
    }
  }, [map, layer]);
  return null;
}

