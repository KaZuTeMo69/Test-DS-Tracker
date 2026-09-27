// Approximate city centres, used only to sanity-check the coordinates in the data
const CITY_CENTERS: Record<string, [number, number]> = {
  "riyadh": [24.7136, 46.6753],
  "jeddah": [21.5433, 39.1728],
  "mecca": [21.3890, 39.8579],
  "makkah": [21.3890, 39.8579],
  "madinah": [24.4686, 39.6142],
  "medina": [24.4686, 39.6142],
  "dammam": [26.4207, 50.0888],
  "khobar": [26.2172, 50.1971],
  "al khobar": [26.2172, 50.1971],
  "dhahran": [26.2736, 50.1417],
  "khamis mushait": [18.3032, 42.7303],
  "abha": [18.2160, 42.5053],
  "hafuf": [25.3833, 49.5833],
  "hofuf": [25.3833, 49.5833],
  "qassim": [26.3260, 43.9784],
  "buraidah": [26.3260, 43.9784],
  "kharj": [24.1500, 47.3000],
  "al kharj": [24.1500, 47.3000],
  "taif": [21.2800, 40.4200],
  "tabuk": [28.3833, 36.5667],
  "yanbu": [24.0891, 38.0637],
  "jubail": [26.9598, 49.6581],
};

// A store further than this from the centre of its listed city has the wrong coordinates
// (Jeddah and Makkah centres are ~73 km apart, so this still tells them apart)
const MAX_KM_FROM_CITY = 60;

const KSA_BOUNDS = { latMin: 16, latMax: 32.5, lngMin: 34.5, lngMax: 56 };

function kmBetween(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

interface CheckedLocation {
  lat: number | null;
  lng: number | null;
  issue?: string;
}

/**
 * Validates a store's coordinates. Bad coordinates are dropped (the store gets no pin)
 * and the reason is returned, rather than guessing where the store might be.
 */
export function checkLocation(city: string, country: string, lat: number | null, lng: number | null): CheckedLocation {
  if (lat === null || lng === null) {
    return { lat: null, lng: null, issue: "No coordinates in the data" };
  }

  const inKSA = /^(ksa|sa|saudi( arabia)?)$/i.test(country.trim());

  // Lat and Lng typed into each other's columns. KSA latitudes (16–32) and
  // longitudes (34–56) don't overlap, so the swap is unambiguous.
  if (inKSA && lat >= 34 && lat <= 56 && lng >= 15 && lng <= 32) {
    [lat, lng] = [lng, lat];
  }

  const shown = `${lat}, ${lng}`;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { lat: null, lng: null, issue: `Coordinates (${shown}) are not valid` };
  }
  if (inKSA && (lat < KSA_BOUNDS.latMin || lat > KSA_BOUNDS.latMax || lng < KSA_BOUNDS.lngMin || lng > KSA_BOUNDS.lngMax)) {
    return { lat: null, lng: null, issue: `Coordinates (${shown}) are outside Saudi Arabia` };
  }

  const center = CITY_CENTERS[city.trim().toLowerCase()];
  if (center) {
    const km = kmBetween(lat, lng, center[0], center[1]);
    if (km > MAX_KM_FROM_CITY) {
      return { lat: null, lng: null, issue: `Coordinates (${shown}) are ${Math.round(km)} km from ${city.trim()}` };
    }
  }

  return { lat, lng };
}
