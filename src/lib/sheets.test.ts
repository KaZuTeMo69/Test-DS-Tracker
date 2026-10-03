import { afterEach, describe, expect, it, vi } from "vitest";
import { cellText, fetchSheetTable, SHEET_TIMEOUT_MS } from "./sheets";
import { rowsToStores } from "./importer";
import { isLive, isPaid } from "./status";

// Google's gviz answer around a table
const gviz = (body: object) =>
  `/*O_o*/\ngoogle.visualization.Query.setResponse(${JSON.stringify({ version: "0.6", status: "ok", ...body })});`;

const answer = (text: string, status = 200) => ({ ok: status >= 200 && status < 300, status, text: async () => text });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("asking Google for a sheet tab", () => {
  it("gives up after the timeout, so the next sync can try again", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError"))),
          ),
      ),
    );
    const loading = fetchSheetTable("SHEET", "All Countries");
    const outcome = expect(loading).rejects.toThrow(`didn't answer within ${SHEET_TIMEOUT_MS / 1000} seconds`);
    await vi.advanceTimersByTimeAsync(SHEET_TIMEOUT_MS);
    await outcome;
  });

  it("an error status is a failure, not a page to read", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer("<html>Not found</html>", 404)),
    );
    await expect(fetchSheetTable("SHEET")).rejects.toThrow("Google Sheets answered with an error (404)");
  });

  it("reads a good answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        answer(gviz({ table: { cols: [{ label: "Store Name" }], rows: [{ c: [{ v: "A" }] }], parsedNumHeaders: 1 } })),
      ),
    );
    expect(await fetchSheetTable("SHEET")).toEqual({ headers: ["Store Name"], rows: [["A"]] });
  });
});

describe("a sheet that isn't shared publicly", () => {
  it("Google's sign-in page in place of the data says to share the sheet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => answer("<!DOCTYPE html><html><title>Sign in - Google Accounts</title></html>")),
    );
    await expect(fetchSheetTable("SHEET")).rejects.toThrow(
      "Google didn't send the sheet's data. Check that the sheet is shared as “Anyone with the link can view”.",
    );
  });

  it("an answer the browser won't read (a redirect to sign in) or a dropped connection says the same", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await expect(fetchSheetTable("SHEET")).rejects.toThrow(
      /^Couldn't reach the Google Sheet\. Check your connection\. Check that the sheet is shared as/,
    );
  });
});

// A gviz table: each cell comes as { v } (or null when empty), and the header row either as the column labels
// (parsedNumHeaders 1) or as the first row (parsedNumHeaders 0, or not given)
const cell = (v: unknown) => (v === null ? null : typeof v === "object" ? v : { v });
const table = (labels: string[], rows: unknown[][], parsedNumHeaders?: number) => ({
  table: { cols: labels.map((label) => ({ label })), rows: rows.map((r) => ({ c: r.map(cell) })), parsedNumHeaders },
});
// The stores in a sheet, read as the app reads them: the table from Google, then its rows matched by header
const storesFrom = async (body: object) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => answer(gviz(body))),
  );
  const { headers, rows } = await fetchSheetTable("SHEET", "All Countries");
  return rowsToStores(headers, rows);
};

const HEADERS = [
  "Store Name",
  "City",
  "DS Code",
  "Contract Duration",
  "Paid / Not Paid",
  "Live / Not Live",
  "Contract Start Date",
  "Area (sqm.)",
  "Annual Rent W/O VAT",
  "Lat",
  "Lng",
];

describe("reading a sheet into stores (a mocked gviz answer)", () => {
  it("header row given as the column labels: every row is a store", async () => {
    const [s, ...rest] = await storesFrom(
      table(HEADERS, [["Olaya", "Riyadh", "DS-1", 2, "Paid", true, "Date(2025,0,15)", 300, 180000, 24.7, 46.68]], 1),
    );
    expect(rest).toHaveLength(0);
    expect(s).toMatchObject({
      name: "Olaya",
      city: "Riyadh",
      dsCode: "DS-1",
      contractDuration: "2",
      startDate: "15 Jan 2025",
      endDate: "14 Jan 2027",
      size: 300,
      rentSARAnnual: 180000,
      lat: 24.7,
      lng: 46.68,
    });
    expect(isPaid(s)).toBe(true);
    expect(isLive(s)).toBe(true); // a checkbox column comes as true
  });

  it("header row not recognised by Google: the first row is the header row", async () => {
    const rows = [
      ["Store Name", "City", "Lat", "Lng"],
      ["Olaya", "Riyadh", 24.7, 46.68],
      ["Store Name", "City", "Lat", "Lng"], // the header repeated further down is skipped
      ["Corniche", "Jeddah", 21.55, 39.17],
    ];
    for (const parsed of [0, undefined]) {
      const stores = await storesFrom(table(["", "", "", ""], rows, parsed));
      expect(stores.map((s) => `${s.name}, ${s.city}`)).toEqual(["Olaya, Riyadh", "Corniche, Jeddah"]);
    }
  });

  it("columns are found by their header text, in any order; missing ones are left empty", async () => {
    const [s] = await storesFrom(table(["Lng", "City", "Store Name", "Lat"], [[46.68, "Riyadh", "Olaya", 24.7]], 1));
    expect(s).toMatchObject({ name: "Olaya", city: "Riyadh", lat: 24.7, lng: 46.68 });
    expect(s).toMatchObject({ dsCode: "", startDate: "", size: null, rentSARAnnual: null, live: "", paid: "" });
    expect(isLive(s)).toBe(false);
  });

  it("no Store Name column: says which columns it found", async () => {
    await expect(storesFrom(table(["City", "Lat"], [["Riyadh", 24.7]], 1))).rejects.toThrow(
      'Couldn\'t find a "Store Name" column in the header row (columns found: City, Lat).',
    );
  });

  it("empty cells and blank rows are skipped over; a formula error is noted, not read as a value", async () => {
    const stores = await storesFrom(
      table(
        ["Store Name", "City", "Annual Rent W/O VAT"],
        [
          ["Olaya", null, { v: 180000, f: "180,000" }],
          [null, null, null],
          ["Malqa", "Riyadh", { v: null, f: "#REF!" }],
        ],
        1,
      ),
    );
    expect(stores.map((s) => s.name)).toEqual(["Olaya", "Malqa"]);
    expect(stores[0]).toMatchObject({ city: "", rentSARAnnual: 180000 });
    expect(stores[1].rentSARAnnual).toBeNull();
    expect(stores[1].sheetErrors).toEqual([{ column: "Annual Rent W/O VAT", value: "#REF!" }]);
  });

  it("Google's own error is shown with its message; a sheet with no rows is called empty", async () => {
    await expect(
      storesFrom({ status: "error", errors: [{ message: "x", detailed_message: "Invalid query" }] }),
    ).rejects.toThrow("Google Sheets error: Invalid query");
    await expect(storesFrom(table(HEADERS, [], 1))).rejects.toThrow("Empty sheet or invalid structure");
  });
});

describe("a gviz cell as text", () => {
  it("dates come as Date(year, month from 0, day), with or without a time", () => {
    expect(cellText({ v: "Date(2025,0,15)" })).toBe("15 Jan 2025");
    expect(cellText({ v: "Date(2024,11,31,13,30,0)" })).toBe("31 Dec 2024");
    expect(cellText({ v: "Date(2024,1,29)" })).toBe("29 Feb 2024");
  });

  it("numbers and booleans as written; empty cells as nothing", () => {
    expect(cellText({ v: 180000, f: "180,000" })).toBe("180000");
    expect(cellText({ v: false })).toBe("false");
    expect(cellText({ v: null })).toBe("");
    expect(cellText(null)).toBe("");
  });

  it("a formula error with no value keeps the error, so it can be listed", () => {
    expect(cellText({ v: null, f: "#DIV/0!" })).toBe("#DIV/0!");
    expect(cellText({ v: null, f: "1,000" })).toBe("");
  });
});
