export interface LatLng {
  lat: number;
  lng: number;
}

function parseDMSToDecimal(input: string): { lat: number; lng: number } | null {
  const dmsRegex =
    /(\d+(?:\.\d+)?)\s*[°Dd\s]?\s*(?:(\d+(?:\.\d+)?)\s*['′Mm\s]?\s*(?:(\d+(?:\.\d+)?)\s*["″”sS]?)?)?\s*([NSEWnsew])/gi;
  const matches = [...input.matchAll(dmsRegex)];

  if (matches.length !== 2) {
    return null;
  }

  const results = matches.map((match) => {
    const degrees = parseFloat(match[1]);
    const minutes = match[2] ? parseFloat(match[2]) : 0;
    const seconds = match[3] ? parseFloat(match[3]) : 0;
    const direction = match[4].toUpperCase();

    let decimal = degrees + minutes / 60 + seconds / 3600;
    if (direction === "S" || direction === "W") {
      decimal = -decimal;
    }
    return { decimal, direction };
  });

  const latMatch = results.find((r) => r.direction === "N" || r.direction === "S");
  const lngMatch = results.find((r) => r.direction === "E" || r.direction === "W");

  if (latMatch && lngMatch) {
    return { lat: latMatch.decimal, lng: lngMatch.decimal };
  }

  return { lat: results[0].decimal, lng: results[1].decimal };
}

const inRange = ({ lat, lng }: LatLng) => lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

/**
 * Reads a coordinate typed in the map search bar: decimal ("24.7136, 46.6753" or "24.7136 46.6753") or
 * degrees-minutes-seconds (27°33'15.5"N 41°42'18.1"E). Returns the point, or an error to show; null when empty.
 */
export function parseCoordinateInput(input: string): { point: LatLng } | { error: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Detect if input contains DMS symbols or hemisphere direction letters
  const isDMS = /[°'"′″”nsewNSEW]/.test(trimmed);
  if (isDMS) {
    const parsed = parseDMSToDecimal(trimmed);
    if (!parsed) return { error: "Invalid DMS format. Try: 27°33'15.5\"N 41°42'18.1\"E" };
    if (!inRange(parsed))
      return { error: "Parsed coordinates are out of valid bounds. Lat [-90, 90], Lng [-180, 180]." };
    return { point: parsed };
  }

  // Default to Decimal Degrees coordinates: handles format like "24.7136, 46.6753" or "24.7136 46.6753"
  let parts = trimmed.split(",");
  if (parts.length < 2) {
    parts = trimmed.split(/[\s]+/);
  }
  if (parts.length < 2) return { error: "Please enter coordinates as Lat, Lng (or DMS)." };

  const point = { lat: parseFloat(parts[0].trim()), lng: parseFloat(parts[1].trim()) };
  if (isNaN(point.lat) || isNaN(point.lng) || !inRange(point)) {
    return { error: "Invalid coordinates. Latitude [-90, 90], Longitude [-180, 180]." };
  }
  return { point };
}
