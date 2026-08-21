import { Store } from "../types";

function parseNum(val: unknown, fallback = 0): number {
  if (val === null || val === undefined) return fallback;
  const s = String(val).trim();
  if (!s) return fallback;
  
  const cleaned = s.replace(/,/g, "").replace(/[^0-9.-]/g, "");
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? fallback : parsed;
}

export function parseCSVData(csvText: string): Store[] {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return [];

  // Parse CSV line respecting quotes
  const parseLine = (text: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if ((char === ',' || char === '\t') && !inQuotes) {
        result.push(cur.trim().replace(/^"|"$/g, ''));
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  };

  const headers = parseLine(lines[0]).map(h => h.toLowerCase().trim());

  // Find column indices
  const findIdx = (keywords: string[]): number => {
    for (const kw of keywords) {
      const idx = headers.findIndex(h => h.includes(kw));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameIdx = findIdx(["store name", "name", "title"]);
  const cityIdx = findIdx(["city", "location"]);
  const dsCodeIdx = findIdx(["ds code", "code", "ds_code", "id"]);
  const durationIdx = findIdx(["contract duration", "duration", "wh code", "whcode"]);
  const paidIdx = findIdx(["paid", "payment"]);
  const liveIdx = findIdx(["live", "status"]);
  const startDateIdx = findIdx(["start date", "start", "contract start"]);
  const areaIdx = findIdx(["area", "size", "sqm"]);
  const rentSqmIdx = findIdx(["rent/sqm", "rent sqm"]);
  const rentAnnualIdx = findIdx(["annual rent", "rent", "annual"]);
  const latIdx = findIdx(["lat", "latitude"]);
  const lngIdx = findIdx(["lng", "lng", "longitude"]);

  const stores: Store[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i]);
    if (cols.length === 0) continue;

    const getCol = (idx: number, defaultVal = "") => (idx !== -1 && cols[idx] !== undefined) ? cols[idx] : defaultVal;

    const name = getCol(nameIdx, `Store #${i}`);
    if (!name || name.toLowerCase().includes("store name")) continue;

    const city = getCol(cityIdx, "Unknown");
    const dsCode = getCol(dsCodeIdx, `DS-${100 + i}`);
    const whCode = getCol(durationIdx, "1 Year");
    const paid = getCol(paidIdx, "Yes");
    const live = getCol(liveIdx, "Yes");
    const startDate = getCol(startDateIdx, new Date().toISOString().split("T")[0]);
    const size = parseNum(getCol(areaIdx), 400);
    const rentSARAnnual = parseNum(getCol(rentAnnualIdx), 200000);
    const rentSARsqm = parseNum(getCol(rentSqmIdx), size > 0 ? rentSARAnnual / size : 500);
    const rentSARMonthly = rentSARAnnual / 12;

    const latVal = parseNum(getCol(latIdx), -999);
    const lngVal = parseNum(getCol(lngIdx), -999);

    const lat = latVal === -999 ? null : latVal;
    const lng = lngVal === -999 ? null : lngVal;

    stores.push({
      id: i,
      dsCode,
      whCode,
      name,
      country: "KSA",
      city,
      rentSARAnnual,
      rentSARMonthly,
      rentSARsqm,
      size,
      lat,
      lng,
      rentUSDAnnual: rentSARAnnual * 0.266667,
      rentUSDMonthly: (rentSARAnnual * 0.266667) / 12,
      rentAEDAnnual: rentSARAnnual * 0.979333,
      rentAEDMonthly: (rentSARAnnual * 0.979333) / 12,
      rentAEDsqm: rentSARsqm * 0.979333,
      startDate,
      endDate: "",
      live,
      paid,
    });
  }

  return stores;
}

export function parseJSONData(jsonText: string): Store[] {
  try {
    const raw = JSON.parse(jsonText);
    const list = Array.isArray(raw) ? raw : (raw.stores || raw.data || []);
    if (!Array.isArray(list)) return [];

    return list.map((item: any, idx: number) => {
      const rentAnnual = parseNum(item.rentSARAnnual || item.annualRent || item.rent, 200000);
      const size = parseNum(item.size || item.area, 400);

      return {
        id: item.id || idx + 1,
        dsCode: item.dsCode || item.code || `DS-${100 + idx}`,
        whCode: item.whCode || item.duration || "1 Year",
        name: item.name || item.storeName || `Dark Store #${idx + 1}`,
        country: item.country || "KSA",
        city: item.city || "Riyadh",
        rentSARAnnual: rentAnnual,
        rentSARMonthly: rentAnnual / 12,
        rentSARsqm: parseNum(item.rentSARsqm || item.rentSqm, size > 0 ? rentAnnual / size : 500),
        size,
        lat: item.lat !== undefined ? parseNum(item.lat, null as any) : null,
        lng: item.lng !== undefined ? parseNum(item.lng, null as any) : null,
        rentUSDAnnual: rentAnnual * 0.266667,
        rentUSDMonthly: (rentAnnual * 0.266667) / 12,
        rentAEDAnnual: rentAnnual * 0.979333,
        rentAEDMonthly: (rentAnnual * 0.979333) / 12,
        rentAEDsqm: (rentAnnual / (size || 1)) * 0.979333,
        startDate: item.startDate || "01 Jan 2024",
        endDate: item.endDate || "",
        live: item.live || "Yes",
        paid: item.paid || "Yes",
      } as Store;
    });
  } catch (err) {
    console.error("JSON parse error:", err);
    return [];
  }
}
