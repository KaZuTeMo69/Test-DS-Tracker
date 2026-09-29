import { Store } from "../types";
import { formatDate, RenewalDays } from "./contract";
import { Coverage } from "./coverage";
import { RENEWAL_STATUS_LABEL, storeRenewal } from "./renewal";

// The sheet's own columns first, named as in the Google Sheet, so an exported file imports again without losing
// anything. The worked-out columns come after; their names don't match any column the importer looks for
const SHEET_COLUMNS: Array<[string, (s: Store) => string | number | null | undefined]> = [
  ["Store Name", (s) => s.name],
  ["City", (s) => s.city],
  ["DS Code", (s) => s.dsCode],
  ["Contract Duration", (s) => s.contractDuration],
  ["Paid / Not Paid", (s) => s.paid],
  ["Live / Not Live", (s) => s.live],
  ["Contract Start Date", (s) => s.startDate],
  ["Contract End Date", (s) => s.endDate], // from the data, or worked out from the start date and duration
  ["Area (sqm.)", (s) => s.size],
  ["Rent/sqm. (SAR)", (s) => s.rentSARsqm],
  ["Annual Rent W/O VAT", (s) => s.rentSARAnnual],
  ["Lat", (s) => s.lat],
  ["Lng", (s) => s.lng],
];

// Spreadsheet apps run a cell that starts with = + @ (or - followed by text) as a formula, so such text is
// written with a leading apostrophe, which they show as plain text
const FORMULA_START = /^(?:[=+@\t\r]|-(?![\d.]))/;

function cell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  let text = String(v);
  if (typeof v === "string" && FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The stores as a CSV file for Excel or Google Sheets: the sheet's columns, then the days to the contract end,
 * the renewal start and status (with the lead and warning days from Settings) and, when zones are on the map,
 * the coverage and white-space zones each store is in. Starts with a byte-order mark so Excel reads Arabic text.
 */
export function storesToCsv(stores: Store[], days: RenewalDays, coverage: Coverage): string {
  const columns: Array<[string, (s: Store) => string | number | null | undefined]> = [
    ...SHEET_COLUMNS,
    ["Days to End", (s) => storeRenewal(s, days).daysToEnd],
    [
      "Renewal Starts",
      (s) => {
        const d = storeRenewal(s, days).renewalStart;
        return d ? formatDate(d) : "";
      },
    ],
    ["Days to Renewal", (s) => storeRenewal(s, days).daysToRenewal],
    ["Renewal Status", (s) => RENEWAL_STATUS_LABEL[storeRenewal(s, days).status]],
  ];
  const zoneNames = (s: Store, of: Map<number, { zoneName: string }[]>, none: string) =>
    s.lat === null || s.lng === null
      ? ""
      : (of
          .get(s.id)
          ?.map((z) => z.zoneName)
          .join("; ") ?? none);
  if (coverage.hasCoverage) columns.push(["Coverage Zone", (s) => zoneNames(s, coverage.zonesOf, "None")]);
  if (coverage.hasWhiteSpace) columns.push(["White Space Zone", (s) => zoneNames(s, coverage.whiteSpaceOf, "")]);

  const lines = [columns.map(([h]) => h), ...stores.map((s) => columns.map(([, get]) => get(s)))];
  return "﻿" + lines.map((row) => row.map(cell).join(",")).join("\r\n");
}

/** dark_stores_2026-09-29.csv (the date where you are), or dark_stores_filtered_… when only some stores are in it. */
export function csvFileName(filtered: boolean, on: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${on.getFullYear()}-${pad(on.getMonth() + 1)}-${pad(on.getDate())}`;
  return `dark_stores_${filtered ? "filtered_" : ""}${date}.csv`;
}
