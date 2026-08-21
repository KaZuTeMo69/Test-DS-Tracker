import { Store } from "../types";
import { pn } from "../constants";

interface MismatchedStore {
  idx: number;
  name: string;
  city: string;
  region: string;
  lat: number;
  lng: number;
  coordRegion: string;
}

interface GvizCell {
  v: string | number | boolean | null;
  f?: string | null;
}

interface GvizRow {
  c: Array<GvizCell | null> | null;
}

const CITY_CENTERS: Record<string, { lat: number; lng: number; latMin: number; latMax: number; lngMin: number; lngMax: number }> = {
  "riyadh": { lat: 24.7136, lng: 46.6753, latMin: 24.3, latMax: 25.1, lngMin: 46.4, lngMax: 47.0 },
  "jeddah": { lat: 21.5433, lng: 39.1728, latMin: 21.1, latMax: 21.9, lngMin: 39.0, lngMax: 39.4 },
  "mecca": { lat: 21.3890, lng: 39.8579, latMin: 21.2, latMax: 21.6, lngMin: 39.6, lngMax: 40.0 },
  "makkah": { lat: 21.3890, lng: 39.8579, latMin: 21.2, latMax: 21.6, lngMin: 39.6, lngMax: 40.0 },
  "madinah": { lat: 24.4686, lng: 39.6142, latMin: 24.2, latMax: 24.7, lngMin: 39.4, lngMax: 39.8 },
  "medina": { lat: 24.4686, lng: 39.6142, latMin: 24.2, latMax: 24.7, lngMin: 39.4, lngMax: 39.8 },
  "dammam": { lat: 26.4207, lng: 50.0888, latMin: 26.1, latMax: 26.5, lngMin: 49.9, lngMax: 50.3 },
  "khobar": { lat: 26.2172, lng: 50.1971, latMin: 26.0, latMax: 26.4, lngMin: 50.0, lngMax: 50.3 },
  "al khobar": { lat: 26.2172, lng: 50.1971, latMin: 26.0, latMax: 26.4, lngMin: 50.0, lngMax: 50.3 },
  "dhahran": { lat: 26.2736, lng: 50.1417, latMin: 26.1, latMax: 26.4, lngMin: 50.1, lngMax: 50.3 },
  "khamis mushait": { lat: 18.3032, lng: 42.7303, latMin: 18.1, latMax: 18.4, lngMin: 42.5, lngMax: 42.9 },
  "abha": { lat: 18.2160, lng: 42.5053, latMin: 18.0, latMax: 18.4, lngMin: 42.3, lngMax: 42.7 },
  "hafuf": { lat: 25.3833, lng: 49.5833, latMin: 25.1, latMax: 25.6, lngMin: 49.4, lngMax: 49.8 },
  "hofuf": { lat: 25.3833, lng: 49.5833, latMin: 25.1, latMax: 25.6, lngMin: 49.4, lngMax: 49.8 },
  "qassim": { lat: 26.3260, lng: 43.9784, latMin: 26.1, latMax: 26.5, lngMin: 43.7, lngMax: 44.2 },
  "buraidah": { lat: 26.3260, lng: 43.9784, latMin: 26.1, latMax: 26.5, lngMin: 43.7, lngMax: 44.2 },
  "kharj": { lat: 24.1500, lng: 47.3000, latMin: 24.0, latMax: 24.3, lngMin: 47.1, lngMax: 47.5 },
  "al kharj": { lat: 24.1500, lng: 47.3000, latMin: 24.0, latMax: 24.3, lngMin: 47.1, lngMax: 47.5 },
  "taif": { lat: 21.2800, lng: 40.4200, latMin: 21.1, latMax: 21.5, lngMin: 40.2, lngMax: 40.6 },
  "tabuk": { lat: 28.3833, lng: 36.5667, latMin: 28.0, latMax: 28.7, lngMin: 36.2, lngMax: 36.9 },
  "yanbu": { lat: 24.0891, lng: 38.0637, latMin: 23.9, latMax: 24.3, lngMin: 37.8, lngMax: 38.3 },
  "jubail": { lat: 26.9598, lng: 49.6581, latMin: 26.8, latMax: 27.2, lngMin: 49.4, lngMax: 49.9 },
};

function getDeterministicJitter(seed: string, offset: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.sin(hash + offset) * 0.035;
}

const REGION_BOUNDS: Record<string, { latMin: number; latMax: number; lngMin: number; lngMax: number }> = {
  "riyadh": { latMin: 24.3, latMax: 25.1, lngMin: 46.4, lngMax: 47.0 },
  "jeddah": { latMin: 21.1, latMax: 21.9, lngMin: 39.0, lngMax: 39.4 },
  "mecca": { latMin: 21.2, latMax: 21.6, lngMin: 39.6, lngMax: 40.0 },
  "madinah": { latMin: 24.2, latMax: 24.7, lngMin: 39.4, lngMax: 39.8 },
  "eastern": { latMin: 26.0, latMax: 27.2, lngMin: 49.3, lngMax: 50.5 }, // Dammam, Khobar, Dhahran, Jubail
  "southern": { latMin: 18.0, latMax: 18.4, lngMin: 42.1, lngMax: 42.9 }, // Abha, Khamis Mushait
  "hafuf": { latMin: 25.1, latMax: 25.6, lngMin: 49.4, lngMax: 49.8 },
  "qassim": { latMin: 25.8, latMax: 26.5, lngMin: 43.5, lngMax: 44.5 },
  "kharj": { latMin: 24.0, latMax: 24.3, lngMin: 47.1, lngMax: 47.5 },
  "taif": { latMin: 21.1, latMax: 21.5, lngMin: 40.2, lngMax: 40.6 },
  "tabuk": { latMin: 28.0, latMax: 28.7, lngMin: 36.2, lngMax: 36.9 },
  "yanbu": { latMin: 23.9, latMax: 24.3, lngMin: 37.8, lngMax: 38.3 },
};

function getRegionOfCity(city: string): string {
  const c = city.trim().toLowerCase();
  if (c === "makkah" || c === "mecca") return "mecca";
  if (c === "medina" || c === "madinah") return "madinah";
  if (c === "dammam" || c === "khobar" || c === "al khobar" || c === "dhahran" || c === "jubail") return "eastern";
  if (c === "abha" || c === "khamis mushait") return "southern";
  if (c === "hofuf" || c === "hafuf") return "hafuf";
  if (c === "buraidah" || c === "qassim") return "qassim";
  if (c === "kharj" || c === "al kharj") return "kharj";
  return c;
}

function getRegionOfCoords(lat: number, lng: number): string | null {
  for (const [region, b] of Object.entries(REGION_BOUNDS)) {
    if (lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax) {
      return region;
    }
  }
  return null;
}

/**
 * Resolves systematic Google Sheets coordinate row misalignment.
 * Out-of-bounds coords are grouped into cycles and shifted back to their proper stores.
 */
function resolveCoordinatesSwaps(stores: Store[]) {
  const getMismatched = (): MismatchedStore[] => {
    const list: MismatchedStore[] = [];
    stores.forEach((s, idx) => {
      if (s.lat !== null && s.lng !== null) {
        const coordRegion = getRegionOfCoords(s.lat, s.lng);
        const region = getRegionOfCity(s.city);
        if (coordRegion !== region && coordRegion !== null) {
          list.push({ idx, name: s.name, city: s.city, region, lat: s.lat, lng: s.lng, coordRegion });
        }
      }
    });
    return list;
  };

  // Resolve cyclic coordinate shifts of lengths up to 12
  for (let len = 2; len <= 12; len++) {
    let foundCycle = true;
    while (foundCycle) {
      foundCycle = false;
      const mismatched = getMismatched();
      
      const path: MismatchedStore[] = [];
      const visited = new Set<number>();
      
      const dfs = (curr: MismatchedStore): boolean => {
        path.push(curr);
        visited.add(curr.idx);
        
        if (path.length === len) {
          let isValid = true;
          for (let i = 0; i < len; i++) {
            const nextIdx = (i + 1) % len;
            if (path[i].coordRegion !== path[nextIdx].region) {
              isValid = false;
              break;
            }
          }
          if (isValid) {
            return true;
          }
          path.pop();
          visited.delete(curr.idx);
          return false;
        }
        
        const targetRegion = curr.coordRegion;
        const candidates = mismatched.filter(m => m.region === targetRegion && !visited.has(m.idx));
        
        for (const cand of candidates) {
          if (dfs(cand)) return true;
        }
        
        path.pop();
        visited.delete(curr.idx);
        return false;
      };
      
      for (const start of mismatched) {
        if (dfs(start)) {
          const tempCoords = path.map(p => ({ lat: stores[p.idx].lat, lng: stores[p.idx].lng }));
          for (let i = 0; i < len; i++) {
            const sourceIdx = (i - 1 + len) % len;
            const targetStore = stores[path[i].idx];
            targetStore.lat = tempCoords[sourceIdx].lat;
            targetStore.lng = tempCoords[sourceIdx].lng;
          }
          foundCycle = true;
          break;
        }
      }
    }
  }
}

export async function fetchSheetData(sheetId: string, sheetName?: string): Promise<Store[]> {
  let url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&t=${Date.now()}`;
  if (sheetName) {
    url += `&sheet=${encodeURIComponent(sheetName)}`;
  }
  
  const response = await fetch(url);
  const text = await response.text();
  
  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/);
  if (!jsonMatch) {
    throw new Error("Failed to parse Google Sheets response");
  }
  
  const data = JSON.parse(jsonMatch[1]);
  if (data.status === "error") {
    const errorDetails = data.errors?.[0]?.detailed_message || data.errors?.[0]?.message || "Unknown error";
    throw new Error(`Google Sheets error: ${errorDetails}`);
  }
  
  const table = data.table;
  if (!table || !table.rows || table.rows.length === 0) {
    throw new Error("Empty sheet or invalid structure");
  }

  // Exact column index map as requested:
  // Index 0: Store Name
  // Index 1: City
  // Index 2: DS Code
  // Index 3: Contract Duration
  // Index 4: Paid / Not Paid
  // Index 5: Live / Not Live
  // Index 6: Contract Start Date
  // Index 7: Area (sqm.)
  // Index 8: Rent/sqm. (SAR)
  // Index 9: Annual Rent W/O VAT
  // Index 10: Location
  // Index 11: Lat
  // Index 12: Lng

  const colIdx = {
    name: 0,
    city: 1,
    dsCode: 2,
    whCode: 3, // Holds Contract Duration
    paid: 4,
    live: 5,
    startDate: 6,
    size: 7,
    rentSARsqm: 8,
    rentSARAnnual: 9,
    location: 10,
    lat: 11,
    lng: 12,
  };

  // Bulletproof number parser helper
  const parseNum = (v: string | number | null | undefined, fallback = 0): number => {
    if (v === null || v === undefined) return fallback;
    let s = String(v).trim();
    if (!s) return fallback;
    
    // Normalize: uppercase, strip commas, trim
    let upper = s.toUpperCase().replace(/,/g, "").trim();
    
    // Check for K/M/B multipliers (e.g. "273K", "1.5M", "SAR 1K")
    const kMatch = upper.match(/([\d.-]+)\s*K/);
    const mMatch = upper.match(/([\d.-]+)\s*M/);
    const bMatch = upper.match(/([\d.-]+)\s*B/);
    
    if (kMatch) {
      const val = parseFloat(kMatch[1]);
      return isNaN(val) ? fallback : val * 1000;
    }
    if (mMatch) {
      const val = parseFloat(mMatch[1]);
      return isNaN(val) ? fallback : val * 1000000;
    }
    if (bMatch) {
      const val = parseFloat(bMatch[1]);
      return isNaN(val) ? fallback : val * 1000000000;
    }
    
    // Fallback: strip everything except numbers, dot, and minus sign
    const cleaned = upper.replace(/[^0-9.-]/g, "");
    if (!cleaned) return fallback;
    const val = parseFloat(cleaned);
    return isNaN(val) ? fallback : val;
  };
  
  // Parse every row starting from index 1 (right after the header row at index 0)
  const parsedStores = (table.rows as GvizRow[]).slice(1).map((row: GvizRow, i: number) => {
    const g = (ci: number): string => {
      const cell = row.c && row.c[ci];
      if (!cell || cell.v === null || cell.v === undefined) return "";
      
      if (typeof cell.v === "string" && cell.v.startsWith("Date(")) {
        const dp = cell.v.match(/Date\((\d+),(\d+),(\d+)\)/);
        if (dp) {
          const year = +dp[1];
          const month = +dp[2];
          const day = +dp[3];
          return new Date(year, month, day).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          });
        }
      }
      
      return cell.v !== undefined ? String(cell.v) : (cell.f !== undefined && cell.f !== null ? String(cell.f) : "");
    };
    
    const cityName = g(colIdx.city);
    const country = "KSA";

    const rentSARAnnual = parseNum(g(colIdx.rentSARAnnual));
    const rentSARsqm = parseNum(g(colIdx.rentSARsqm));
    const rentSARMonthly = rentSARAnnual / 12;

    const size = parseNum(g(colIdx.size));

    // Fixed values for KSA target
    const rentUSDAnnual = rentSARAnnual * 0.266667;
    const rentUSDMonthly = rentUSDAnnual / 12;

    const rentAEDAnnual = rentSARAnnual * 0.979333;
    const rentAEDMonthly = rentAEDAnnual / 12;
    const rentAEDsqm = rentSARsqm * 0.979333;

    // Use -999 fallback to detect empty coordinates and return null
    let latVal = parseNum(g(colIdx.lat), -999);
    let lngVal = parseNum(g(colIdx.lng), -999);

    if (latVal !== -999 && lngVal !== -999) {
      // Dynamic verification parameter: check if coordinates are flipped
      // (latitude in longitude range 34-56 and longitude in latitude range 15-32)
      const isLatFlipped = latVal >= 34 && latVal <= 56;
      const isLngFlipped = lngVal >= 15 && lngVal <= 32;
      if (isLatFlipped && isLngFlipped) {
        const temp = latVal;
        latVal = lngVal;
        lngVal = temp;
      }
    }

    const lat = latVal === -999 ? null : latVal;
    const lng = lngVal === -999 ? null : lngVal;

    return {
      id: i,
      dsCode: g(colIdx.dsCode),
      whCode: g(colIdx.whCode), // holds the Contract Duration value
      name: g(colIdx.name),
      country,
      city: cityName,
      rentUSDAnnual,
      rentUSDMonthly,
      size,
      lat,
      lng,
      rentAEDAnnual,
      rentAEDMonthly,
      rentAEDsqm,
      startDate: g(colIdx.startDate),
      endDate: "", // Empty or fallback
      rentSARAnnual,
      rentSARMonthly,
      rentSARsqm,
      live: g(colIdx.live),
      paid: g(colIdx.paid),
    } as Store;
  }).filter((s: Store) => s.name.trim() !== "");

  // Resolve cross-city coordinate shifts systematically
  resolveCoordinatesSwaps(parsedStores);

  // Apply fallback for any unresolved rows
  parsedStores.forEach((s, idx) => {
    const cityClean = s.city.trim().toLowerCase();
    const cityConfig = CITY_CENTERS[cityClean];

    if (cityConfig) {
      if (s.lat !== null && s.lng !== null) {
        const isOutside = s.lat < cityConfig.latMin || s.lat > cityConfig.latMax || s.lng < cityConfig.lngMin || s.lng > cityConfig.lngMax;
        if (isOutside) {
          s.lat = cityConfig.lat + getDeterministicJitter(s.name, idx + 1);
          s.lng = cityConfig.lng + getDeterministicJitter(s.name, idx + 2);
        }
      } else {
        s.lat = cityConfig.lat + getDeterministicJitter(s.name, idx + 1);
        s.lng = cityConfig.lng + getDeterministicJitter(s.name, idx + 2);
      }
    }
  });

  return parsedStores;
}
