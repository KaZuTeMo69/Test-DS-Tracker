import { isSheetError } from "./importer";

interface GvizCell {
  v: string | number | boolean | null;
  f?: string | null;
}

interface GvizRow {
  c: Array<GvizCell | null> | null;
}

interface GvizCol {
  label?: string;
}

export function cellText(cell: GvizCell | null | undefined): string {
  if (!cell) return "";
  // A formula error can come as an empty value with the error only in the displayed text
  if (cell.v === null || cell.v === undefined) return cell.f && isSheetError(cell.f) ? cell.f : "";

  if (typeof cell.v === "string" && cell.v.startsWith("Date(")) {
    // Date(year, month from 0, day), followed by the time for a cell that has one; only the date is kept
    const dp = cell.v.match(/^Date\((\d+),(\d+),(\d+)(?:,\d+)*\)$/);
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

  return String(cell.v);
}

interface GvizTable {
  cols?: GvizCol[];
  rows?: GvizRow[];
  parsedNumHeaders?: number;
}

interface GvizResponse {
  status?: string;
  errors?: Array<{ message?: string; detailed_message?: string }>;
  table?: GvizTable;
}

/** How long a sheet request may take before it's given up (the next sync tries again). */
export const SHEET_TIMEOUT_MS = 30_000;

// What to check when Google won't hand the sheet over: a sheet that isn't shared publicly is answered with Google's
// sign-in page (which the browser may also refuse to read across sites, as a network error)
const SHARING_HINT = "Check that the sheet is shared as “Anyone with the link can view”.";

// One request to Google's public gviz endpoint; throws when there's no answer in time, an error status, or an answer
// that can't be read. A request that never answered would otherwise keep the auto-refresh waiting for good
async function requestGviz(sheetId: string, sheetName?: string): Promise<GvizResponse> {
  let url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&t=${Date.now()}`;
  if (sheetName) {
    url += `&sheet=${encodeURIComponent(sheetName)}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SHEET_TIMEOUT_MS);
  let text: string;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`Google Sheets answered with an error (${response.status})`);
    text = await response.text();
  } catch (err) {
    if (controller.signal.aborted)
      throw new Error(`Google Sheets didn't answer within ${SHEET_TIMEOUT_MS / 1000} seconds`, { cause: err });
    // fetch rejects with a TypeError for a dropped connection or an answer the browser won't let the page read
    if (err instanceof TypeError)
      throw new Error(`Couldn't reach the Google Sheet. Check your connection. ${SHARING_HINT}`, { cause: err });
    throw err;
  } finally {
    clearTimeout(timer);
  }

  const jsonMatch = text.match(/google\.visualization\.Query\.setResponse\((.*)\);/);
  if (!jsonMatch) {
    throw new Error(`Google didn't send the sheet's data. ${SHARING_HINT}`);
  }
  return JSON.parse(jsonMatch[1]);
}

// Columns are found by their header text (Store Name, City, DS Code, Contract Duration,
// Paid / Not Paid, Live / Not Live, Contract Start Date, Area (sqm.), Rent/sqm. (SAR),
// Annual Rent W/O VAT, Lat, Lng), so inserting or reordering columns in the sheet is safe.
function tableText(table: GvizTable): { headers: string[]; rows: string[][] } {
  const cols: GvizCol[] = table.cols || [];
  const rows = (table.rows || []).map((row) => (row.c || []).map(cellText));

  // When Google recognises the header row it reports it in parsedNumHeaders, moves its text
  // into the column labels and leaves it out of the rows. Otherwise the header is the first row.
  const headerCount = typeof table.parsedNumHeaders === "number" ? table.parsedNumHeaders : 0;
  const headers = headerCount > 0 ? cols.map((c) => c.label || "") : rows[0] || [];
  const dataRows = headerCount > 0 ? rows : rows.slice(1);

  return { headers, rows: dataRows };
}

/** A sheet tab's header row and data rows, read through Google's public gviz endpoint. */
export async function fetchSheetTable(
  sheetId: string,
  sheetName?: string,
): Promise<{ headers: string[]; rows: string[][] }> {
  const data = await requestGviz(sheetId, sheetName);
  if (data.status === "error") {
    const errorDetails = data.errors?.[0]?.detailed_message || data.errors?.[0]?.message || "Unknown error";
    throw new Error(`Google Sheets error: ${errorDetails}`);
  }

  const table = data.table;
  if (!table || !table.rows || table.rows.length === 0) {
    throw new Error("Empty sheet or invalid structure");
  }
  return tableText(table);
}

/**
 * A tab that may not be there: its header row and rows (none when it only has its header), or null when Google
 * answers with an error. Google may also answer with the first tab, so the caller checks the headers. Throws when
 * there's no answer or it can't be read, as for a dropped connection.
 */
export async function fetchOptionalTab(
  sheetId: string,
  sheetName: string,
): Promise<{ headers: string[]; rows: string[][] } | null> {
  const data = await requestGviz(sheetId, sheetName);
  if (data.status === "error" || !data.table) return null;
  return tableText(data.table);
}
