import { Store } from "../types";
import { isSheetError, rowsToStores } from "./importer";

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

// One request to Google's public gviz endpoint; throws when there's no answer or it can't be read
async function requestGviz(sheetId: string, sheetName?: string): Promise<GvizResponse> {
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

/** The stores in a sheet tab. */
export async function fetchSheetData(sheetId: string, sheetName?: string): Promise<Store[]> {
  const { headers, rows } = await fetchSheetTable(sheetId, sheetName);
  return rowsToStores(headers, rows);
}
