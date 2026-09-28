import { Store } from "../types";
import { contractEndDate, formatDate, parseDate, parseDurationMonths } from "./contract";
import { checkLocation } from "./location";

/**
 * Reads a number from a cell such as "273,500", "SAR 1.5M", "273K" or "450 m2".
 * Returns null for blank or non-numeric cells so missing data stays visible as missing.
 * Set multipliers to false for fields where K/M/B can't mean thousand/million/billion (area, coordinates).
 */
function parseNum(val: unknown, multipliers = true): number | null {
  if (val === null || val === undefined) return null;
  const s = String(val).replace(/,/g, "").trim();
  const m = s.match(/-?\d+(?:\.\d+)?/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  if (!multipliers) return n;
  // K/M/B only count when they stand alone, so "12 Months" isn't read as 12 million
  const suffix = s.slice(m.index! + m[0].length).match(/^\s*([kmb])(?![a-z0-9²])/i);
  if (!suffix) return n;
  return n * { k: 1e3, m: 1e6, b: 1e9 }[suffix[1].toLowerCase() as "k" | "m" | "b"];
}

/** Splits CSV/TSV text into rows of cells, honouring quotes, "" escapes and line breaks inside quotes. */
function parseDelimited(text: string): string[][] {
  text = text.replace(/^﻿/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = [",", "\t", ";"].reduce(
    (best, d) => (firstLine.split(d).length > firstLine.split(best).length ? d : best),
    ",",
  );

  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cur += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(cur.trim());
      cur = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cur.trim());
      rows.push(row);
      row = [];
      cur = "";
    } else {
      cur += char;
    }
  }
  row.push(cur.trim());
  rows.push(row);
  return rows.filter((r) => r.some((c) => c !== ""));
}

type Field =
  | "name"
  | "city"
  | "duration"
  | "dsCode"
  | "paid"
  | "live"
  | "startDate"
  | "endDate"
  | "rentSqm"
  | "size"
  | "rentAnnual"
  | "lat"
  | "lng";

// Header phrases per field, matched as whole words. Fields are assigned in this order and a
// column taken by one field isn't reused, so "Rent/sqm" is claimed before the plain "rent"
// fallback for annual rent, and "Payment Status" before the "status" fallback for live.
const COLUMN_PATTERNS: Array<{ field: Field; phrases: string[]; exclude?: string[] }> = [
  { field: "name", phrases: ["store name", "name", "title"] },
  { field: "city", phrases: ["city", "location"] },
  { field: "duration", phrases: ["contract duration", "duration", "wh code", "whcode"] },
  { field: "dsCode", phrases: ["ds code", "dscode", "store code", "code", "id"] },
  { field: "paid", phrases: ["paid", "payment"] },
  { field: "live", phrases: ["live", "status"] },
  { field: "startDate", phrases: ["contract start date", "start date", "contract start", "start"] },
  { field: "endDate", phrases: ["contract end date", "end date", "contract end", "expiry date", "expiry"] },
  { field: "rentSqm", phrases: ["rent sqm", "rent per sqm", "rent m2", "sqm rent"] },
  { field: "size", phrases: ["area", "size", "sqm", "m2"] },
  {
    field: "rentAnnual",
    phrases: ["annual rent", "rent annual", "yearly rent", "rent"],
    exclude: ["month", "monthly"],
  },
  { field: "lat", phrases: ["lat", "latitude"] },
  { field: "lng", phrases: ["lng", "lon", "long", "longitude"] },
];

const normalizeHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function mapColumns(headers: string[]): Record<Field, number> {
  const words = headers.map((h) => ` ${normalizeHeader(h)} `);
  const claimed = new Set<number>();
  const result = {} as Record<Field, number>;

  for (const { field, phrases, exclude = [] } of COLUMN_PATTERNS) {
    result[field] = -1;
    for (const phrase of phrases) {
      const idx = words.findIndex(
        (w, i) => !claimed.has(i) && w.includes(` ${phrase} `) && !exclude.some((x) => w.includes(` ${x} `)),
      );
      if (idx !== -1) {
        result[field] = idx;
        claimed.add(idx);
        break;
      }
    }
  }
  return result;
}

interface StoreFields {
  name: string;
  city: string;
  country: string;
  dsCode: string;
  whCode: string;
  paid: string;
  live: string;
  startDate: string;
  endDate: string;
  size: number | null;
  rentSARsqm: number | null;
  rentSARAnnual: number | null;
  lat: number | null;
  lng: number | null;
}

/** Contract dates in one format; the end date comes from the data, or else start date + contract duration. */
function contractDates(startText: string, endText: string, duration: string) {
  const start = parseDate(startText);
  const months = parseDurationMonths(duration);
  const end = endText ? parseDate(endText) : start && months ? contractEndDate(start, months) : null;
  // Text that isn't a readable date is kept as it is, so dataIssues can point at it
  return { startDate: start ? formatDate(start) : startText, endDate: end ? formatDate(end) : endText };
}

/** Fills in monthly and per-m² rent, the contract end date, and validates coordinates. Nothing missing is made up. */
function buildStore(id: number, f: StoreFields): Store {
  const annual = f.rentSARAnnual;
  const dates = contractDates(f.startDate, f.endDate, f.whCode);
  const rentSARsqm = f.rentSARsqm ?? (annual !== null && f.size ? annual / f.size : null);
  const location = checkLocation(f.city, f.country, f.lat, f.lng);

  return {
    id,
    dsCode: f.dsCode,
    whCode: f.whCode,
    name: f.name,
    country: f.country,
    city: f.city,
    rentSARAnnual: annual,
    rentSARMonthly: annual === null ? null : annual / 12,
    rentSARsqm,
    size: f.size,
    lat: location.lat,
    lng: location.lng,
    locationIssue: location.issue,
    startDate: dates.startDate,
    endDate: dates.endDate,
    live: f.live,
    paid: f.paid,
  };
}

/** Turns a header row plus data rows (from a CSV file or a Google Sheet) into stores. */
export function rowsToStores(headers: string[], rows: string[][]): Store[] {
  const col = mapColumns(headers);
  if (col.name === -1) {
    const found = headers.filter((h) => h.trim()).join(", ") || "none";
    throw new Error(`Couldn't find a "Store Name" column in the header row (columns found: ${found}).`);
  }
  const nameHeader = normalizeHeader(headers[col.name]);

  const stores: Store[] = [];
  for (const cells of rows) {
    const get = (idx: number) => (idx === -1 ? "" : (cells[idx] ?? "").trim());
    const name = get(col.name);
    // Skip blank rows and header rows repeated further down the data
    if (!name || normalizeHeader(name) === nameHeader) continue;

    stores.push(
      buildStore(stores.length + 1, {
        name,
        city: get(col.city),
        country: "KSA",
        dsCode: get(col.dsCode),
        whCode: get(col.duration),
        paid: get(col.paid),
        live: get(col.live),
        startDate: get(col.startDate),
        endDate: get(col.endDate),
        size: parseNum(get(col.size), false),
        rentSARsqm: parseNum(get(col.rentSqm)),
        rentSARAnnual: parseNum(get(col.rentAnnual)),
        lat: parseNum(get(col.lat), false),
        lng: parseNum(get(col.lng), false),
      }),
    );
  }
  return stores;
}

export function parseCSVData(csvText: string): Store[] {
  const [headers, ...rows] = parseDelimited(csvText);
  if (!headers) return [];
  return rowsToStores(headers, rows);
}

export function parseJSONData(jsonText: string): Store[] {
  let raw: any;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  const list = Array.isArray(raw) ? raw : raw?.stores || raw?.data || [];
  if (!Array.isArray(list)) return [];

  // First value that is actually present; unlike ||, keeps 0 and false
  const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== "");
  const text = (...vals: unknown[]) => String(pick(...vals) ?? "").trim();

  const stores: Store[] = [];
  list.forEach((item: any) => {
    const name = text(item?.name, item?.storeName);
    if (!name) return;
    stores.push(
      buildStore(stores.length + 1, {
        name,
        city: text(item.city),
        country: text(item.country) || "KSA",
        dsCode: text(item.dsCode, item.code),
        whCode: text(item.whCode, item.duration),
        paid: text(item.paid),
        live: text(item.live),
        startDate: text(item.startDate),
        endDate: text(item.endDate, item.contractEndDate),
        size: parseNum(pick(item.size, item.area), false),
        rentSARsqm: parseNum(pick(item.rentSARsqm, item.rentSqm)),
        rentSARAnnual: parseNum(pick(item.rentSARAnnual, item.annualRent, item.rent)),
        lat: parseNum(pick(item.lat), false),
        lng: parseNum(pick(item.lng), false),
      }),
    );
  });
  return stores;
}
