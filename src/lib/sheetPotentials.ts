import { csvCell } from "./csvExport";
import { fetchOptionalTab } from "./sheets";
import { isSheetError } from "./importer";
import { checkLocation } from "./location";
import { parseDate } from "./contract";
import {
  coordsCell,
  number,
  Potential,
  PotentialColumn,
  potentialColumnFields,
  POTENTIAL_STATUS_LABEL,
  toStatus,
  tsvCell,
} from "./potentials";

/**
 * The shared pipeline lives in a "Potentials" tab of the store spreadsheet. The app only reads it: people edit it in
 * Google Sheets. Potentials added in the app are drafts in this browser until their row is in the tab.
 */
export const POTENTIALS_TAB = "Potentials";

// The tab's columns in order: the template's header row, and the order of a copied row when the tab isn't read yet
export const POTENTIAL_SHEET_COLUMNS: Array<[string, PotentialColumn]> = [
  ["ID", "id"],
  ["Name", "name"],
  ["City", "city"],
  ["District", "district"],
  ["Lat", "lat"],
  ["Lng", "lng"],
  ["Status", "status"],
  ["Size (m²)", "size"],
  ["Asking Rent (SAR/yr)", "askingRentAnnual"],
  ["Expected OPD", "expectedOpd"],
  ["Contact", "contact"],
  ["Notes", "notes"],
  ["Feasibility Link", "feasibilityLink"],
  ["Drop Reason", "dropReason"],
  ["Added By", "addedBy"],
  ["Date Added", "createdAt"],
];

/** The template: the header row only, to import into the spreadsheet as its Potentials tab. */
export function potentialsTemplateCsv(): string {
  return "﻿" + POTENTIAL_SHEET_COLUMNS.map(([h]) => csvCell(h)).join(",") + "\r\n";
}

// Named Potentials.csv, Google Sheets' "Insert new sheet" import names the tab Potentials
export const TEMPLATE_FILE_NAME = "Potentials.csv";

/** The spreadsheet in Google Sheets, from the sheet ID saved in this browser. */
export const spreadsheetLink = (sheetId: string) =>
  `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`;

const sameHeaders = (a: string[], b: string[]) =>
  a.length === b.length && a.every((h, i) => h.trim().toLowerCase() === (b[i] ?? "").trim().toLowerCase());

/**
 * Whether a table read for the Potentials tab really is it. Asked for a tab that doesn't exist, Google can send the
 * first tab instead, so the table must have a Name column, a location (Lat and Lng, or Coordinates) and an ID or
 * Status column, and must not be the store tab just read.
 */
export function isPotentialsTable(headers: string[], storeHeaders: string[] | null): boolean {
  if (storeHeaders?.length && sameHeaders(headers, storeHeaders)) return false;
  const fields = new Set(potentialColumnFields(headers));
  const located = fields.has("coords") || (fields.has("lat") && fields.has("lng"));
  return fields.has("name") && located && (fields.has("id") || fields.has("status"));
}

// ── Reading the tab ──

export type SheetIssueKind = "status" | "location" | "dropReason" | "noId" | "duplicateId" | "noName";

export interface SheetRowIssue {
  kind: SheetIssueKind;
  row: number; // the row in the tab, the header being row 1
  id: string; // as written, "" when none
  name: string; // as written
  detail: string;
  shownId: string | null; // the Potential the row is shown as (to select it); null when it isn't on the map
}

export interface SheetPotentials {
  list: Potential[]; // the rows that could be placed on the map, in the tab's order
  issues: SheetRowIssue[];
  headers: string[]; // the tab's header row, for a copied row in its column order
}

// A date as written in the sheet (30 Sep 2026, 30/09/2026, 2026-09-30…) as ISO; "" when there's none or it can't be read
function dateIso(cell: string): string {
  if (!cell) return "";
  const d = parseDate(cell) ?? new Date(cell);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

type Located = { lat: number; lng: number } | { problem: string };

// Lat and Lng, else one Coordinates column; checked as the store pins are (range, and distance from a known city)
function locate(get: (f: PotentialColumn) => string, city: string): Located {
  const latText = get("lat");
  const lngText = get("lng");
  const coordsText = get("coords");
  let lat: number | null = null;
  let lng: number | null = null;
  if (latText || lngText) {
    lat = number(latText);
    lng = number(lngText);
    if (lat === null || lng === null)
      return { problem: `Lat "${latText}" and Lng "${lngText}" aren't both numbers, so it isn't on the map.` };
  } else if (coordsText) {
    const point = coordsCell(coordsText);
    if (!point) return { problem: `Coordinates "${coordsText}" can't be read as lat, lng, so it isn't on the map.` };
    ({ lat, lng } = point);
  } else {
    return { problem: "No coordinates, so it isn't on the map." };
  }
  if (lat === 0 && lng === 0) return { problem: "Coordinates are 0, 0, so it isn't on the map." };
  const checked = checkLocation(city, "", lat, lng);
  if (checked.lat === null || checked.lng === null) return { problem: `${checked.issue}, so it isn't on the map.` };
  return { lat: checked.lat, lng: checked.lng };
}

/**
 * The Potentials in the tab's rows, matched to their columns by header. Rows that can't be placed (no or bad
 * coordinates) and rows sharing an ID with an earlier one are left out; they, unknown statuses, Dropped rows
 * without a reason, and rows without an ID or a name are listed as issues. An unknown or empty status reads as Study.
 */
export function readPotentialsTable(headers: string[], rows: string[][]): SheetPotentials {
  const fields = potentialColumnFields(headers);
  const list: Potential[] = [];
  const issues: SheetRowIssue[] = [];
  const rowOfId = new Map<string, number>();

  rows.forEach((cells, i) => {
    const row = i + 2;
    // A formula error (#N/A…) reads as an empty cell
    const clean = cells.map((c) => (c && !isSheetError(c.trim()) ? c.trim() : ""));
    if (clean.every((c) => !c)) return;
    const get = (f: PotentialColumn) => {
      const at = fields.indexOf(f);
      return at < 0 ? "" : (clean[at] ?? "");
    };
    const id = get("id");
    const name = get("name");
    const found: Array<[SheetIssueKind, string]> = [];

    if (id && rowOfId.has(id)) {
      const first = rowOfId.get(id)!;
      issues.push({
        kind: "duplicateId",
        row,
        id,
        name,
        detail: `Same ID as row ${first}; only row ${first} is shown.`,
        shownId: null,
      });
      return;
    }
    if (id) rowOfId.set(id, row);
    else found.push(["noId", "No ID, so a draft copied from the app can't be matched to it."]);
    if (!name) found.push(["noName", "No name."]);

    const city = get("city");
    const place = locate(get, city);
    if ("problem" in place) found.push(["location", place.problem]);

    const statusText = get("status");
    const status = toStatus(statusText);
    if (statusText && !status)
      found.push(["status", `"${statusText}" isn't Study, Approved, Backup or Dropped; read as Study.`]);
    const dropReason = get("dropReason");
    if (status === "dropped" && !dropReason) found.push(["dropReason", "Dropped, but the Drop Reason is empty."]);

    const shownId = "problem" in place ? null : id || `ROW-${row}`;
    for (const [kind, detail] of found) issues.push({ kind, row, id, name, detail, shownId });
    if ("problem" in place) return;

    const createdAt = dateIso(get("createdAt"));
    list.push({
      id: shownId!,
      name: name || id || `Row ${row}`,
      city,
      district: get("district"),
      lat: place.lat,
      lng: place.lng,
      status: status ?? "study",
      size: number(get("size")),
      askingRentAnnual: number(get("askingRentAnnual")),
      expectedOpd: number(get("expectedOpd")),
      contact: get("contact"),
      notes: get("notes"),
      feasibilityLink: get("feasibilityLink"),
      dropReason: status === "dropped" ? dropReason : "",
      createdAt,
      updatedAt: dateIso(get("updatedAt")) || createdAt,
      statusChangedAt: dateIso(get("statusChangedAt")),
      addedBy: get("addedBy"),
    });
  });
  return { list, issues, headers };
}

/** The drafts whose ID is now on a row of the tab (one that could be read), so the draft can go. */
export function draftsInSheet(drafts: Potential[], sheet: Potential[]): Potential[] {
  const ids = new Set(sheet.map((p) => p.id));
  return drafts.filter((d) => ids.has(d.id));
}

// ── A draft as a row for the tab ──

// A date as the sheet reads it back: the day where you are, 2026-09-30
function localDay(iso: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const SHEET_VALUE: Record<PotentialColumn, (p: Potential) => string | number | null> = {
  id: (p) => p.id,
  name: (p) => p.name,
  city: (p) => p.city,
  district: (p) => p.district,
  lat: (p) => p.lat.toFixed(6),
  lng: (p) => p.lng.toFixed(6),
  coords: (p) => `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`,
  status: (p) => POTENTIAL_STATUS_LABEL[p.status],
  size: (p) => p.size,
  askingRentAnnual: (p) => p.askingRentAnnual,
  expectedOpd: (p) => p.expectedOpd,
  contact: (p) => p.contact,
  notes: (p) => p.notes,
  feasibilityLink: (p) => p.feasibilityLink,
  dropReason: (p) => p.dropReason,
  addedBy: (p) => p.addedBy,
  createdAt: (p) => localDay(p.createdAt),
  updatedAt: (p) => localDay(p.updatedAt),
  statusChangedAt: (p) => localDay(p.statusChangedAt),
};

/**
 * One tab-separated row to paste into the Potentials tab. Once the tab has been read, its values go under the tab's
 * own columns (blank under any other); before that, in the template's column order.
 */
export function potentialSheetRow(p: Potential, tabHeaders: string[] | null): string {
  const fields = tabHeaders?.length ? potentialColumnFields(tabHeaders) : POTENTIAL_SHEET_COLUMNS.map(([, f]) => f);
  return fields.map((f) => tsvCell(f ? SHEET_VALUE[f](p) : "")).join("\t");
}

/** Every draft as rows for the tab, one per line. */
export const potentialSheetRows = (drafts: Potential[], tabHeaders: string[] | null) =>
  drafts.map((p) => potentialSheetRow(p, tabHeaders)).join("\n");

// ── Loading ──

/**
 * The Potentials tab of the spreadsheet, or null when there's no such tab (Google's error, or the first tab sent
 * in its place). Throws when the request fails, so the last list read can be kept.
 */
export async function loadPotentialsTab(
  sheetId: string,
  storeHeaders: string[] | null,
): Promise<SheetPotentials | null> {
  const table = await fetchOptionalTab(sheetId, POTENTIALS_TAB);
  if (!table || !isPotentialsTable(table.headers, storeHeaders)) return null;
  return readPotentialsTable(table.headers, table.rows);
}

// ── Data Quality ──

// Each kind of problem in the tab: its title and how to fix it, in the order they're listed
export const SHEET_ISSUE_GROUPS: Array<[SheetIssueKind, { title: string; fix: string }]> = [
  [
    "location",
    {
      title: "Missing or invalid coordinates",
      fix: "Fill in Lat and Lng (or one Coordinates column as lat, lng). These rows aren't on the map until then.",
    },
  ],
  [
    "status",
    {
      title: "Unknown status",
      fix: "Use Study, Approved, Backup or Dropped (Scouting and Under Study read as Study).",
    },
  ],
  ["dropReason", { title: "Dropped without a reason", fix: "Say why it was dropped in the Drop Reason column." }],
  [
    "duplicateId",
    { title: "Same ID on more than one row", fix: "Give each row its own ID. Only the first row with an ID is shown." },
  ],
  [
    "noId",
    {
      title: "No ID",
      fix: "Give each row an ID (POT-XXXXX), so a draft copied in from the app is matched to its row.",
    },
  ],
  ["noName", { title: "No name", fix: "Fill in the Name column." }],
];

export interface SheetIssueGroup {
  kind: SheetIssueKind;
  title: string;
  fix: string;
  items: SheetRowIssue[];
}

/** The tab's problems grouped by kind, and how many rows have any. */
export function sheetIssueGroups(issues: SheetRowIssue[]): { groups: SheetIssueGroup[]; rows: number } {
  const groups = SHEET_ISSUE_GROUPS.map(([kind, text]) => ({
    kind,
    ...text,
    items: issues.filter((i) => i.kind === kind),
  })).filter((g) => g.items.length);
  return { groups, rows: new Set(issues.map((i) => i.row)).size };
}
