import { Store } from "../types";
import { contractEndDate, formatDate, parseDate, parseDurationMonths, westernDigits } from "./contract";
import { checkLocation } from "./location";
import { rentFigures, serviceFeesAnnual } from "./rent";

/**
 * Reads a number from a cell such as "273,500", "SAR 1.5M", "273K" or "450 m2".
 * Returns null for blank or non-numeric cells so missing data stays visible as missing.
 * Set multipliers to false for fields where K/M/B can't mean thousand/million/billion (area, coordinates).
 */
/**
 * A number from a cell: "1,200", "SAR 450,000", "85 m²", "1.5M" (K/M/B when they stand alone), and Arabic-Indic
 * digits with the Arabic thousands and decimal separators ("٢٠٠٬٠٠٠"). Null when there's no number in it.
 */
export function parseNum(val: unknown, multipliers = true): number | null {
  if (val === null || val === undefined) return null;
  const s = westernDigits(String(val))
    .replace(/[,\u066C]/g, "")
    .replace(/\u066B/g, ".")
    .trim();
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
export function parseDelimited(text: string): string[][] {
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

export type StoreField =
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
  | "lng"
  | "contractNo"
  | "contractStatus"
  | "nextPayment"
  | "contractTotal"
  | "serviceFees"
  | "region"
  | "opdAsOf"
  | "opd";

// Header phrases per field, matched as whole words. Fields are assigned in this order and a
// column taken by one field isn't reused, so "Rent/sqm" is claimed before the plain "rent"
// fallback for annual rent, "Payment Status" before the "status" fallback for live, and the
// contract register's "Contract Status" and "Next Payment" before the "status" and "payment" fallbacks.
const COLUMN_PATTERNS: Array<{ field: StoreField; phrases: string[]; exclude?: string[] }> = [
  { field: "name", phrases: ["store name", "name", "title"] },
  { field: "city", phrases: ["city", "location"] },
  { field: "duration", phrases: ["contract duration", "duration", "wh code", "whcode"] },
  { field: "contractNo", phrases: ["contract no", "contract number", "contract num", "contract ref"] },
  { field: "contractStatus", phrases: ["contract status"] },
  { field: "nextPayment", phrases: ["next payment", "next payments", "next payment date", "next due date"] },
  { field: "contractTotal", phrases: ["contract total value", "total contract value", "contract total"] },
  // Before "payment" (paid) and "rent", so "Service Payments" or "Service Fees" isn't taken for either
  {
    field: "serviceFees",
    phrases: [
      "service fees",
      "service fee",
      "service charges",
      "service charge",
      "service payments",
      "service payment",
      "services fees",
      "service cost",
      "service costs",
    ],
    exclude: ["month", "monthly"],
  },
  { field: "region", phrases: ["region"] },
  // "OPD As Of" before "OPD", which it contains
  { field: "opdAsOf", phrases: ["opd as of", "opd date", "orders as of"] },
  { field: "opd", phrases: ["opd", "orders per day", "orders day", "orders a day"] },
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

export const normalizeHeader = (h: string) =>
  h
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * A spreadsheet error in a cell (#N/A, #REF!, #VALUE!, #DIV/0!, #NAME?, #NUM!, #NULL!, #ERROR!, #SPILL!…), as
 * lookup formulas leave when there's nothing to find. Read as an empty cell.
 */
export const isSheetError = (text: string) => /^#(?:N\/A|[A-Z0-9_/]+[!?])$/i.test(text.trim());

/**
 * The column each field is read from. When several headers match the same field (a sheet with both "City" and
 * "Location", say), the first one is used unless it has no data at all and another one does.
 */
function mapColumns(headers: string[], rows: string[][] = []): Record<StoreField, number> {
  const words = headers.map((h) => ` ${normalizeHeader(h)} `);
  const claimed = new Set<number>();
  const result = {} as Record<StoreField, number>;
  const hasData = (i: number) =>
    rows.some((r) => {
      const v = (r[i] ?? "").trim();
      return v !== "" && !isSheetError(v);
    });

  for (const { field, phrases, exclude = [] } of COLUMN_PATTERNS) {
    // Every matching column, by phrase (the likelier header first), then from the left
    const candidates: number[] = [];
    for (const phrase of phrases)
      words.forEach((w, i) => {
        if (claimed.has(i) || candidates.includes(i)) return;
        if (w.includes(` ${phrase} `) && !exclude.some((x) => w.includes(` ${x} `))) candidates.push(i);
      });
    const idx = (rows.length ? candidates.find(hasData) : undefined) ?? candidates[0] ?? -1;
    result[field] = idx;
    if (idx !== -1) claimed.add(idx);
  }
  return result;
}

/** The store field each header is read into (null for columns the app doesn't read), matched as on import. */
export function storeColumnFields(headers: string[]): (StoreField | null)[] {
  const col = mapColumns(headers);
  const fieldAt = new Map(Object.entries(col).map(([field, idx]) => [idx, field as StoreField]));
  return headers.map((_, i) => fieldAt.get(i) ?? null);
}

interface StoreFields {
  name: string;
  city: string;
  country: string;
  dsCode: string;
  contractDuration: string;
  paid: string;
  live: string;
  startDate: string;
  endDate: string;
  size: number | null;
  rentSARsqm: number | null;
  rentSARAnnual: number | null;
  lat: number | null;
  lng: number | null;
  // From the contract register (filled by lookup formulas in the sheet; errors are read as empty)
  contractNo?: string;
  contractStatus?: string;
  nextPayment?: string;
  contractTotal?: number | null; // SAR, including 15% VAT
  serviceFees?: number | null; // as the rent column: a year's, or the term's for a short contract; without VAT
  region?: string;
  opd?: number | null;
  opdAsOf?: string;
  sheetErrors?: Array<{ column: string; value: string }>;
}

/** Contract dates in one format; the end date comes from the data, or else start date + contract duration. */
function contractDates(startText: string, endText: string, duration: string) {
  const start = parseDate(startText);
  const months = parseDurationMonths(duration);
  const end = endText ? parseDate(endText) : start && months ? contractEndDate(start, months) : null;
  // Text that isn't a readable date is kept as it is, so dataIssues can point at it
  return { startDate: start ? formatDate(start) : startText, endDate: end ? formatDate(end) : endText };
}

/**
 * Fills in the annual, monthly and per-m² rent (a short contract's rent is its term's total, see rentFigures), the
 * contract end date, and validates coordinates. Nothing missing is made up.
 */
function buildStore(id: number, f: StoreFields): Store {
  const dates = contractDates(f.startDate, f.endDate, f.contractDuration);
  const rent = rentFigures(f.rentSARAnnual, parseDurationMonths(f.contractDuration), f.size, f.rentSARsqm);
  const location = checkLocation(f.city, f.country, f.lat, f.lng);

  return {
    id,
    dsCode: f.dsCode,
    contractDuration: f.contractDuration,
    name: f.name,
    country: f.country,
    city: f.city,
    rentSARAnnual: rent.annual,
    rentSARMonthly: rent.monthly,
    rentSARsqm: rent.perSqm,
    contractValue: rent.contractValue,
    termMonths: rent.termMonths,
    size: f.size,
    lat: location.lat,
    lng: location.lng,
    locationIssue: location.issue,
    startDate: dates.startDate,
    endDate: dates.endDate,
    live: f.live,
    paid: f.paid,
    contractNo: f.contractNo ?? "",
    contractStatus: f.contractStatus ?? "",
    nextPayment: tidyDate(f.nextPayment ?? ""),
    contractTotal: f.contractTotal ?? null,
    serviceFeesAnnual: serviceFeesAnnual(f.serviceFees ?? null, rent.termMonths),
    region: f.region ?? "",
    opd: f.opd ?? null,
    opdAsOf: f.opdAsOf ?? "",
    sheetErrors: f.sheetErrors?.length ? f.sheetErrors : undefined,
  };
}

// A readable date in the sheet's format ("05 Jan 2026"); anything else as it is, so Data Quality can point at it
function tidyDate(text: string): string {
  const d = text ? parseDate(text) : null;
  return d ? formatDate(d) : text;
}

/** Turns a header row plus data rows (from a CSV file or a Google Sheet) into stores. */
export function rowsToStores(headers: string[], rows: string[][]): Store[] {
  const col = mapColumns(headers, rows);
  if (col.name === -1) {
    const found = headers.filter((h) => h.trim()).join(", ") || "none";
    throw new Error(`Couldn't find a "Store Name" column in the header row (columns found: ${found}).`);
  }
  const nameHeader = normalizeHeader(headers[col.name]);

  const stores: Store[] = [];
  for (const cells of rows) {
    // Spreadsheet errors are read as empty, and noted so Data Quality can list them
    const errors: Array<{ column: string; value: string }> = [];
    const get = (idx: number) => {
      const v = idx === -1 ? "" : (cells[idx] ?? "").trim();
      if (!isSheetError(v)) return v;
      errors.push({ column: headers[idx].trim() || `Column ${idx + 1}`, value: v.toUpperCase() });
      return "";
    };
    const name = get(col.name);
    // Skip blank rows and header rows repeated further down the data
    if (!name || normalizeHeader(name) === nameHeader) continue;

    stores.push(
      buildStore(stores.length + 1, {
        name,
        city: get(col.city),
        country: "KSA",
        dsCode: get(col.dsCode),
        contractDuration: get(col.duration),
        paid: get(col.paid),
        live: get(col.live),
        startDate: get(col.startDate),
        endDate: get(col.endDate),
        size: parseNum(get(col.size), false),
        rentSARsqm: parseNum(get(col.rentSqm)),
        rentSARAnnual: parseNum(get(col.rentAnnual)),
        lat: parseNum(get(col.lat), false),
        lng: parseNum(get(col.lng), false),
        contractNo: get(col.contractNo),
        contractStatus: get(col.contractStatus),
        nextPayment: get(col.nextPayment),
        contractTotal: parseNum(get(col.contractTotal)),
        serviceFees: parseNum(get(col.serviceFees)),
        region: get(col.region),
        opd: parseNum(get(col.opd)),
        opdAsOf: get(col.opdAsOf),
        sheetErrors: errors,
      }),
    );
  }
  return stores;
}

/** The header row of CSV / TSV text, or null when it isn't CSV (JSON). */
export function csvHeaders(text: string): string[] | null {
  if (/^\s*[[{]/.test(text)) return null;
  return parseDelimited(text)[0] ?? null;
}

export function parseCSVData(csvText: string): Store[] {
  const [headers, ...rows] = parseDelimited(csvText);
  if (!headers) return [];
  return rowsToStores(headers, rows);
}

export function parseJSONData(jsonText: string): Store[] {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch (err) {
    throw new Error(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  // A list, or { stores: [...] } or { data: [...] }
  const wrapper = raw && typeof raw === "object" ? (raw as { stores?: unknown; data?: unknown }) : undefined;
  const list = Array.isArray(raw) ? raw : wrapper?.stores || wrapper?.data || [];
  if (!Array.isArray(list)) return [];

  // First value that is actually present; unlike ||, keeps 0 and false
  const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && String(v).trim() !== "");
  const text = (...vals: unknown[]) => String(pick(...vals) ?? "").trim();

  const stores: Store[] = [];
  list.forEach((entry: unknown) => {
    if (!entry || typeof entry !== "object") return;
    const item = entry as Record<string, unknown>;
    const name = text(item.name, item.storeName);
    if (!name) return;
    stores.push(
      buildStore(stores.length + 1, {
        name,
        city: text(item.city),
        country: text(item.country) || "KSA",
        dsCode: text(item.dsCode, item.code),
        // whCode is the field's old name, still accepted in older JSON files
        contractDuration: text(item.contractDuration, item.whCode, item.duration),
        paid: text(item.paid),
        live: text(item.live),
        startDate: text(item.startDate),
        endDate: text(item.endDate, item.contractEndDate),
        size: parseNum(pick(item.size, item.area), false),
        rentSARsqm: parseNum(pick(item.rentSARsqm, item.rentSqm)),
        rentSARAnnual: parseNum(pick(item.rentSARAnnual, item.annualRent, item.rent)),
        lat: parseNum(pick(item.lat), false),
        lng: parseNum(pick(item.lng), false),
        contractNo: text(item.contractNo),
        contractStatus: text(item.contractStatus),
        nextPayment: text(item.nextPayment),
        contractTotal: parseNum(pick(item.contractTotal, item.contractTotalValue)),
        serviceFees: parseNum(pick(item.serviceFees, item.serviceFeesAnnual, item.serviceCharge)),
        region: text(item.region),
        opd: parseNum(pick(item.opd, item.ordersPerDay)),
        opdAsOf: text(item.opdAsOf),
      }),
    );
  });
  return stores;
}
