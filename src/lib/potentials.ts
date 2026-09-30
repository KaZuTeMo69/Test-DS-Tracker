import { Store, ZoneLayer } from "../types";
import { csvCell, STORE_SHEET_HEADERS } from "./csvExport";
import { escapeXml } from "./kmlExport";
import { normalizeHeader, parseDelimited, StoreField, storeColumnFields } from "./importer";
import { pointInZone, ZoneHit } from "./coverage";
import { hexToKmlColor, zoneColor } from "./layers";

// ── What a Potential is ──

/**
 * A Potential is a scouted location being studied before it's approved, dropped or kept as a backup. It isn't a
 * store: it has no contract and doesn't count in the store figures, renewals or data checks.
 */
export type PotentialStatus = "study" | "approved" | "backup" | "dropped";

export const POTENTIAL_STATUSES: PotentialStatus[] = ["study", "approved", "backup", "dropped"];

export const POTENTIAL_STATUS_LABEL: Record<PotentialStatus, string> = {
  study: "Study",
  approved: "Approved",
  backup: "Backup",
  dropped: "Dropped",
};

// Pin and badge colours. Their lightness steps down too (about 81 / 70 / 56 / 35), so they stay apart without colour
export const POTENTIAL_COLOR: Record<PotentialStatus, string> = {
  study: "#fbbf24",
  approved: "#22c55e",
  backup: "#3b82f6",
  dropped: "#525252",
};

export interface Potential {
  id: string; // POT-XXXXX
  name: string;
  city: string;
  district: string; // "" when not given, as for the other optional text
  lat: number;
  lng: number;
  status: PotentialStatus;
  size: number | null; // m²
  askingRentAnnual: number | null; // SAR a year, without VAT like the store sheet's rent
  contact: string; // landlord or broker
  notes: string;
  feasibilityLink: string;
  dropReason: string; // required while dropped, cleared otherwise
  createdAt: string; // ISO
  updatedAt: string;
  statusChangedAt: string;
  addedBy: string;
}

/** What's typed in the add / edit form: everything but the id and the times. */
export type PotentialDraft = Omit<Potential, "id" | "createdAt" | "updatedAt" | "statusChangedAt">;

/** Asking rent per m² a year, from the asking rent and the size; null without both. */
export const rentPerSqm = (p: Pick<Potential, "askingRentAnnual" | "size">) =>
  p.askingRentAnnual !== null && p.askingRentAnnual > 0 && p.size !== null && p.size > 0
    ? p.askingRentAnnual / p.size
    : null;

// Without letters and digits that are easily confused (0/O, 1/I/L), as the id is read aloud and typed
const ID_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/** A new POT-XXXXX id, different from the ones taken. */
export function newPotentialId(taken: Set<string> | string[] = [], random = Math.random): string {
  const used = taken instanceof Set ? taken : new Set(taken);
  for (;;) {
    let id = "POT-";
    for (let i = 0; i < 5; i++) id += ID_CHARS[Math.floor(random() * ID_CHARS.length)];
    if (!used.has(id)) return id;
  }
}

export const isPotentialStatus = (v: unknown): v is PotentialStatus =>
  typeof v === "string" && (POTENTIAL_STATUSES as string[]).includes(v);

// ── Checks ──

export type PotentialErrors = Partial<Record<"name" | "city" | "location" | "dropReason" | "feasibilityLink", string>>;

const validCoords = (lat: unknown, lng: unknown) =>
  typeof lat === "number" &&
  typeof lng === "number" &&
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

export const isWebLink = (text: string) => /^https?:\/\/[^\s]+\.[^\s]+/i.test(text.trim());

/** What's wrong with a Potential as typed: name and city are required, and a dropped one needs its reason. */
export function checkPotential(p: PotentialDraft): PotentialErrors {
  const errors: PotentialErrors = {};
  if (!p.name.trim()) errors.name = "Enter a name";
  if (!p.city.trim()) errors.city = "Enter the city";
  if (!validCoords(p.lat, p.lng)) errors.location = "Place the pin on the map";
  if (p.status === "dropped" && !p.dropReason.trim()) errors.dropReason = "Say why it was dropped";
  if (p.feasibilityLink.trim() && !isWebLink(p.feasibilityLink))
    errors.feasibilityLink = "Paste a full link, starting with https://";
  return errors;
}

/**
 * A Potential with a new status. Dropping needs a reason (null is returned without one); leaving "dropped"
 * clears the reason. The status time moves only when the status does.
 */
export function withStatus(p: Potential, status: PotentialStatus, dropReason = "", now = new Date()): Potential | null {
  if (status === "dropped" && !dropReason.trim()) return null;
  const at = now.toISOString();
  return {
    ...p,
    status,
    dropReason: status === "dropped" ? dropReason.trim() : "",
    statusChangedAt: status === p.status ? p.statusChangedAt : at,
    updatedAt: at,
  };
}

/** A new Potential from the form, with its id and times. */
export function createPotential(draft: PotentialDraft, taken: Iterable<string>, now = new Date()): Potential {
  const at = now.toISOString();
  return {
    ...tidy(draft),
    id: newPotentialId(new Set(taken)),
    createdAt: at,
    updatedAt: at,
    statusChangedAt: at,
  };
}

// Trimmed text; the drop reason only while dropped
function tidy<T extends PotentialDraft>(p: T): T {
  return {
    ...p,
    name: p.name.trim(),
    city: p.city.trim(),
    district: p.district.trim(),
    contact: p.contact.trim(),
    notes: p.notes.trim(),
    feasibilityLink: p.feasibilityLink.trim(),
    addedBy: p.addedBy.trim(),
    dropReason: p.status === "dropped" ? p.dropReason.trim() : "",
  };
}

/** The Potential after an edit: the times follow what changed. */
export function editPotential(p: Potential, patch: Partial<PotentialDraft>, now = new Date()): Potential {
  const at = now.toISOString();
  const next = tidy({ ...p, ...patch });
  return { ...next, updatedAt: at, statusChangedAt: next.status === p.status ? p.statusChangedAt : at };
}

// ── Reading saved or imported entries ──

const text = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");

/** A number from a cell or a saved value: "1,200", "SAR 450,000", "85 m²"; null when there isn't one. */
function number(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const m = text(v)
    .replace(/,/g, "")
    .match(/-?\d+(?:\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

const isoOr = (v: unknown, fallback: string) => {
  const t = text(v).trim();
  const d = t ? new Date(t) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback;
};

/**
 * A Potential from saved data or an import, or null when it can't be one (no name or no valid location).
 * Anything else missing gets a default: status Study, a new id, now for the times.
 */
export function toPotential(raw: unknown, taken: Set<string>, now = new Date()): Potential | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name).trim();
  const lat = number(r.lat);
  const lng = number(r.lng);
  if (!name || !validCoords(lat, lng)) return null;
  const at = now.toISOString();
  const status = toStatus(r.status) ?? "study";
  const id = text(r.id).trim() || newPotentialId(taken);
  const createdAt = isoOr(r.createdAt, at);
  return tidy({
    id,
    name,
    city: text(r.city),
    district: text(r.district),
    lat: lat!,
    lng: lng!,
    status,
    size: number(r.size),
    askingRentAnnual: number(r.askingRentAnnual),
    contact: text(r.contact),
    notes: text(r.notes),
    feasibilityLink: text(r.feasibilityLink),
    // A dropped entry without a reason stays dropped, with the reason noted as missing
    dropReason: status === "dropped" ? text(r.dropReason).trim() || "Not recorded" : "",
    createdAt,
    updatedAt: isoOr(r.updatedAt, createdAt),
    statusChangedAt: isoOr(r.statusChangedAt, createdAt),
    addedBy: text(r.addedBy),
  });
}

/** A status as written ("Approved", "dropped "); null when it isn't one. */
export function toStatus(v: unknown): PotentialStatus | null {
  const t = text(v).trim().toLowerCase();
  const found = POTENTIAL_STATUSES.find((s) => s === t || POTENTIAL_STATUS_LABEL[s].toLowerCase() === t);
  return found ?? null;
}

// ── Moving the old manual stores over ──

/**
 * The manual stores saved by earlier versions (localStorage dst.manualStores), as Potentials under study. They were
 * scouted sites added from the map, never real stores. Their rent becomes the asking rent; damaged entries are skipped.
 */
export function manualStoresToPotentials(saved: string | null, taken: Set<string>, now = new Date()): Potential[] {
  if (!saved) return [];
  let list: unknown;
  try {
    list = JSON.parse(saved);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const out: Potential[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const s = item as Partial<Store>;
    const p = toPotential(
      {
        name: s.name,
        city: s.city,
        lat: s.lat,
        lng: s.lng,
        size: s.size,
        askingRentAnnual: s.rentSARAnnual,
        status: "study",
        notes: s.dsCode && s.dsCode !== "MANUAL" ? `DS code ${s.dsCode}` : "",
      },
      taken,
      now,
    );
    if (!p) continue;
    taken.add(p.id);
    out.push(p);
  }
  return out;
}

// ── Where a Potential sits: zones and rent ──

export interface ZonesAt {
  hasCoverage: boolean; // any coverage zones shown on the map
  hasWhiteSpace: boolean;
  coverage: ZoneHit[];
  whiteSpace: ZoneHit[];
}

/** The coverage and white-space zones a point is in, among the layers shown on the map (as for the stores). */
export function zonesAt(lat: number, lng: number, layers: ZoneLayer[]): ZonesAt {
  const result: ZonesAt = { hasCoverage: false, hasWhiteSpace: false, coverage: [], whiteSpace: [] };
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.zones.length) {
      if (layer.kind === "coverage") result.hasCoverage = true;
      else result.hasWhiteSpace = true;
    }
    for (const zone of layer.zones) {
      if (!pointInZone(lat, lng, zone)) continue;
      const hit: ZoneHit = {
        layerId: layer.id,
        layerName: layer.name,
        zoneId: zone.id,
        zoneName: zone.name || "Unnamed zone",
        color: zoneColor(zone, layer),
      };
      (layer.kind === "coverage" ? result.coverage : result.whiteSpace).push(hit);
    }
  }
  return result;
}

// ── Days since added ──

/** Whole days since a time (0 on the day itself). */
export const daysSince = (iso: string, now = new Date()) =>
  Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000));

// ── CSV ──

type Column = [string, (p: Potential) => string | number | null];

// The order of the Potentials tab in the Google Sheet; the file imports back into the app as it is
export const POTENTIAL_COLUMNS: Column[] = [
  ["ID", (p) => p.id],
  ["Name", (p) => p.name],
  ["City", (p) => p.city],
  ["District", (p) => p.district],
  ["Lat", (p) => p.lat],
  ["Lng", (p) => p.lng],
  ["Status", (p) => POTENTIAL_STATUS_LABEL[p.status]],
  ["Size (m²)", (p) => p.size],
  ["Asking Rent (SAR/yr)", (p) => p.askingRentAnnual],
  [
    "Rent/m² (SAR)",
    (p) => {
      const r = rentPerSqm(p);
      return r === null ? null : Math.round(r * 100) / 100;
    },
  ],
  ["Contact", (p) => p.contact],
  ["Notes", (p) => p.notes],
  ["Feasibility Link", (p) => p.feasibilityLink],
  ["Drop Reason", (p) => p.dropReason],
  ["Added By", (p) => p.addedBy],
  ["Date Added", (p) => p.createdAt],
  ["Updated", (p) => p.updatedAt],
  ["Status Changed", (p) => p.statusChangedAt],
];

/** The Potentials as a CSV file: UTF-8 with a byte-order mark, so Excel shows Arabic names. */
export function potentialsToCsv(list: Potential[]): string {
  const lines = [POTENTIAL_COLUMNS.map(([h]) => h), ...list.map((p) => POTENTIAL_COLUMNS.map(([, get]) => get(p)))];
  return "﻿" + lines.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

// Header words per field, compared after lower-casing and dropping punctuation ("Size (m²)" → "size m")
const HEADER_FIELDS: Array<[keyof Potential, string[]]> = [
  ["id", ["id", "potential id"]],
  ["name", ["name", "potential name", "site name"]],
  ["city", ["city"]],
  ["district", ["district", "neighbourhood", "neighborhood"]],
  ["lat", ["lat", "latitude"]],
  ["lng", ["lng", "lon", "long", "longitude"]],
  ["status", ["status"]],
  ["size", ["size", "size m", "area", "area m", "size sqm", "area sqm"]],
  ["askingRentAnnual", ["asking rent", "asking rent sar yr", "asking rent sar", "rent", "annual rent"]],
  ["contact", ["contact", "landlord", "broker"]],
  ["notes", ["notes", "note"]],
  ["feasibilityLink", ["feasibility link", "feasibility", "study link"]],
  ["dropReason", ["drop reason", "reason dropped"]],
  ["addedBy", ["added by"]],
  ["createdAt", ["date added", "created", "created at"]],
  ["updatedAt", ["updated", "updated at"]],
  ["statusChangedAt", ["status changed", "status changed at"]],
];

const fieldOfHeader = (header: string): keyof Potential | null => {
  const h = normalizeHeader(header);
  return HEADER_FIELDS.find(([, names]) => names.includes(h))?.[0] ?? null;
};

export interface PotentialImport {
  list: Potential[]; // everything after the merge
  added: number;
  updated: number;
  skipped: number; // rows without a name or a valid location
}

/**
 * Merges imported Potentials into the list: a row whose ID is already there replaces it (keeping its first added
 * date when the row has none); any other row is added, with a new ID when it has none.
 */
function merge(existing: Potential[], rows: Record<string, unknown>[], now: Date): PotentialImport {
  const byId = new Map(existing.map((p) => [p.id, p]));
  const taken = new Set(byId.keys());
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const row of rows) {
    const old = byId.get(text(row.id).trim());
    const p = toPotential({ ...row, createdAt: row.createdAt || old?.createdAt }, taken, now);
    if (!p) {
      skipped++;
      continue;
    }
    if (old) updated++;
    else added++;
    byId.set(p.id, p);
    taken.add(p.id);
  }
  return { list: [...byId.values()], added, updated, skipped };
}

/** Potentials from a CSV file (as exported, or typed up in a spreadsheet), merged into the list by ID. */
export function importPotentialsCsv(csv: string, existing: Potential[], now = new Date()): PotentialImport {
  const [headers, ...rows] = parseDelimited(csv);
  if (!headers) return { list: existing, added: 0, updated: 0, skipped: 0 };
  const fields = headers.map(fieldOfHeader);
  if (!fields.includes("name")) throw new Error('No "Name" column in the header row.');
  const objects = rows.map((cells) => {
    const o: Record<string, unknown> = {};
    fields.forEach((f, i) => {
      if (f && o[f] === undefined) o[f] = cells[i] ?? "";
    });
    return o;
  });
  return merge(existing, objects, now);
}

/** Potentials from a JSON file: a list, or { potentials: [...] }, with the app's field names. */
export function importPotentialsJson(json: string, existing: Potential[], now = new Date()): PotentialImport {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  const list = Array.isArray(raw) ? raw : (raw as { potentials?: unknown })?.potentials;
  if (!Array.isArray(list)) throw new Error("No list of potentials in the file.");
  return merge(
    existing,
    list.filter((x) => x && typeof x === "object"),
    now,
  );
}

// ── KML ──

/** The Potentials as pins in a KML file (Google Earth, My Maps), coloured by status. */
export function potentialsToKml(list: Potential[]): string {
  const styles = POTENTIAL_STATUSES.map(
    (s) =>
      `    <Style id="potential-${s}"><IconStyle><color>${hexToKmlColor(POTENTIAL_COLOR[s])}</color>` +
      `<Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_square.png</href></Icon></IconStyle></Style>`,
  );
  const pins = list.map((p) => {
    const rate = rentPerSqm(p);
    const lines = [
      `${POTENTIAL_STATUS_LABEL[p.status]} · ${p.id}`,
      [p.district, p.city].filter(Boolean).join(", "),
      p.size !== null ? `Size: ${p.size} m²` : "",
      p.askingRentAnnual !== null
        ? `Asking rent: SAR ${Math.round(p.askingRentAnnual).toLocaleString("en-US")} / yr`
        : "",
      rate !== null ? `Rent/m²: SAR ${Math.round(rate).toLocaleString("en-US")}` : "",
      p.status === "dropped" ? `Dropped: ${p.dropReason}` : "",
      p.contact ? `Contact: ${p.contact}` : "",
      p.notes,
      p.feasibilityLink,
    ].filter(Boolean);
    return [
      "    <Placemark>",
      `      <name>${escapeXml(p.name)}</name>`,
      `      <description>${escapeXml(lines.join("\n"))}</description>`,
      `      <styleUrl>#potential-${p.status}</styleUrl>`,
      `      <Point><coordinates>${p.lng},${p.lat},0</coordinates></Point>`,
      "    </Placemark>",
    ].join("\n");
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Document>",
    "    <name>Potentials</name>",
    ...styles,
    ...pins,
    "  </Document>",
    "</kml>",
    "",
  ].join("\n");
}

/** potentials_2026-09-30.csv / .kml (the date where you are). */
export function potentialsFileName(ext: "csv" | "kml", on = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `potentials_${on.getFullYear()}-${pad(on.getMonth() + 1)}-${pad(on.getDate())}.${ext}`;
}

// ── Copy as a store row ──

// What an approved Potential puts in each store column; the contract columns stay blank until it's signed
const STORE_VALUE: Partial<Record<StoreField, (p: Potential) => string | number | null>> = {
  name: (p) => p.name,
  city: (p) => p.city,
  live: () => "Not Live",
  size: (p) => p.size,
  rentSqm: (p) => {
    const r = rentPerSqm(p);
    return r === null ? null : Math.round(r * 100) / 100;
  },
  rentAnnual: (p) => p.askingRentAnnual,
  lat: (p) => p.lat,
  lng: (p) => p.lng,
};

// A cell for a tab-separated row: tabs and line breaks would split it, so they become spaces
const tsvCell = (v: string | number | null | undefined) =>
  v === null || v === undefined ? "" : String(v).replace(/[\t\r\n]+/g, " ");

/**
 * One tab-separated row to paste into the store sheet: the Potential's values under the columns they belong to, in
 * the order of the sheet (or file) loaded, blank elsewhere. Without one, the sample sheet's order.
 */
export function storeRowTsv(p: Potential, headers: string[] | null): string {
  const cols = headers && headers.length ? headers : STORE_SHEET_HEADERS;
  return storeColumnFields(cols)
    .map((field) => tsvCell(field ? STORE_VALUE[field]?.(p) : ""))
    .join("\t");
}
