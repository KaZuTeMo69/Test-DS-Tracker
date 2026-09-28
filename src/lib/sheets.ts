import { Store } from "../types";
import { rowsToStores } from "./importer";

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

function cellText(cell: GvizCell | null | undefined): string {
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

  return String(cell.v);
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

  // Columns are found by their header text (Store Name, City, DS Code, Contract Duration,
  // Paid / Not Paid, Live / Not Live, Contract Start Date, Area (sqm.), Rent/sqm. (SAR),
  // Annual Rent W/O VAT, Lat, Lng), so inserting or reordering columns in the sheet is safe.
  const cols: GvizCol[] = table.cols || [];
  const rows = (table.rows as GvizRow[]).map((row) => (row.c || []).map(cellText));

  // When Google recognises the header row it reports it in parsedNumHeaders, moves its text
  // into the column labels and leaves it out of the rows. Otherwise the header is the first row.
  const headerCount = typeof table.parsedNumHeaders === "number" ? table.parsedNumHeaders : 0;
  const headers = headerCount > 0 ? cols.map((c) => c.label || "") : rows[0] || [];
  const dataRows = headerCount > 0 ? rows : rows.slice(1);

  return rowsToStores(headers, dataRows);
}
