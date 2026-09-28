import { describe, expect, it } from "vitest";
import { parseCSVData, parseJSONData, rowsToStores } from "./importer";

// The Google Sheet's header row
const SHEET_HEADERS = [
  "Store Name",
  "City",
  "DS Code",
  "Contract Duration",
  "Paid / Not Paid",
  "Live / Not Live",
  "Contract Start Date",
  "Area (sqm.)",
  "Rent/sqm. (SAR)",
  "Annual Rent W/O VAT",
  "Lat",
  "Lng",
];
const ROW = [
  "Olaya Hub",
  "Riyadh",
  "DS-1",
  "2",
  "Paid",
  "Live",
  "15/01/2025",
  "450",
  "533",
  "240,000",
  "24.7",
  "46.68",
];

describe("column mapping", () => {
  it("reads every field of the sheet by its header", () => {
    const [s] = rowsToStores(SHEET_HEADERS, [ROW]);
    expect(s).toMatchObject({
      name: "Olaya Hub",
      city: "Riyadh",
      dsCode: "DS-1",
      contractDuration: "2",
      paid: "Paid",
      live: "Live",
      startDate: "15 Jan 2025",
      endDate: "14 Jan 2027", // start + 2 years
      size: 450,
      rentSARsqm: 533,
      rentSARAnnual: 240000,
      rentSARMonthly: 20000,
      lat: 24.7,
      lng: 46.68,
      country: "KSA",
    });
  });

  it("finds columns by name whatever their order", () => {
    const order = [11, 3, 0, 9, 5, 1, 7, 2, 10, 4, 6, 8];
    const [s] = rowsToStores(
      order.map((i) => SHEET_HEADERS[i]),
      [order.map((i) => ROW[i])],
    );
    expect(s).toMatchObject({ name: "Olaya Hub", dsCode: "DS-1", rentSARAnnual: 240000, lat: 24.7, lng: 46.68 });
  });

  it('still reads the old "WH Code" header as the contract duration', () => {
    const [s] = rowsToStores(["Store Name", "WH Code", "Contract Start Date"], [["A", "3", "01/02/2025"]]);
    expect(s.contractDuration).toBe("3");
    expect(s.endDate).toBe("31 Jan 2028");
  });

  it("uses an explicit Contract End Date over start + duration", () => {
    const [s] = rowsToStores(
      ["Store Name", "Contract Duration", "Contract Start Date", "Contract End Date"],
      [["A", "2", "01/01/2025", "30/06/2026"]],
    );
    expect(s.endDate).toBe("30 Jun 2026");
  });

  it("doesn't mistake the Paid column for an ID or the Rent/sqm column for annual rent", () => {
    const [s] = rowsToStores(["Store Name", "Paid", "Rent/sqm", "Rent"], [["A", "Paid", "500", "100000"]]);
    expect(s.paid).toBe("Paid");
    expect(s.dsCode).toBe("");
    expect(s.rentSARsqm).toBe(500);
    expect(s.rentSARAnnual).toBe(100000);
  });

  it("works out rent per m² when the sheet doesn't give it", () => {
    const [s] = rowsToStores(["Store Name", "Area", "Annual Rent"], [["A", "400", "200000"]]);
    expect(s.rentSARsqm).toBe(500);
  });

  it("throws a clear error without a Store Name column", () => {
    expect(() => rowsToStores(["City", "Rent"], [["Riyadh", "1"]])).toThrow(/Store Name/);
  });
});

describe("values", () => {
  const one = (headers: string[], row: string[]) => rowsToStores(["Store Name", ...headers], [["A", ...row]])[0];

  it("reads rent written with separators and K / M", () => {
    expect(one(["Annual Rent"], ["273,500"]).rentSARAnnual).toBe(273500);
    expect(one(["Annual Rent"], ["SAR 1.5M"]).rentSARAnnual).toBe(1_500_000);
    expect(one(["Annual Rent"], ["273K"]).rentSARAnnual).toBe(273000);
  });

  it("never reads m² as millions", () => {
    expect(one(["Area"], ["450 m2"]).size).toBe(450);
  });

  it("keeps blanks as missing instead of inventing values", () => {
    const s = one(["Area", "Annual Rent", "Live", "Paid"], ["", "", "", ""]);
    expect(s.size).toBeNull();
    expect(s.rentSARAnnual).toBeNull();
    expect(s.rentSARMonthly).toBeNull();
    expect(s.live).toBe("");
  });

  it("drops implausible coordinates and says why", () => {
    const s = one(["City", "Lat", "Lng"], ["Riyadh", "21.5", "39.2"]); // Jeddah's position
    expect(s.lat).toBeNull();
    expect(s.locationIssue).toMatch(/km from Riyadh/);
  });

  it("swaps Lat and Lng typed into each other's columns", () => {
    const s = one(["City", "Lat", "Lng"], ["Riyadh", "46.68", "24.7"]);
    expect([s.lat, s.lng]).toEqual([24.7, 46.68]);
  });
});

describe("parseCSVData", () => {
  it("handles quoted commas, escaped quotes and line breaks, and skips blank or repeated header rows", () => {
    const csv = [
      "﻿Store Name,City,Annual Rent",
      '"Olaya, North",Riyadh,"240,000"',
      "",
      "Store Name,City,Annual Rent",
      '"The ""Big"" One","Jed\ndah",100',
    ].join("\r\n");
    const stores = parseCSVData(csv);
    expect(stores.map((s) => s.name)).toEqual(["Olaya, North", 'The "Big" One']);
    expect(stores[0].rentSARAnnual).toBe(240000);
    expect(stores[1].city).toBe("Jed\ndah");
  });

  it("reads tab- and semicolon-separated text", () => {
    expect(parseCSVData("Store Name\tCity\nA\tRiyadh")[0].city).toBe("Riyadh");
    expect(parseCSVData("Store Name;City\nA;Riyadh")[0].city).toBe("Riyadh");
  });
});

describe("parseJSONData", () => {
  it("reads a list of stores, including the old whCode name", () => {
    const [a, b] = parseJSONData(
      JSON.stringify([
        { name: "A", city: "Riyadh", whCode: "2", startDate: "2025-03-01" },
        { storeName: "B", contractDuration: "1 year", annualRent: 90000 },
      ]),
    );
    expect(a.contractDuration).toBe("2");
    expect(a.endDate).toBe("28 Feb 2027");
    expect(b.name).toBe("B");
    expect(b.rentSARAnnual).toBe(90000);
  });

  it("reads { stores: [...] } and skips entries without a name", () => {
    expect(parseJSONData(JSON.stringify({ stores: [{ name: "A" }, { city: "Riyadh" }] }))).toHaveLength(1);
  });

  it("explains invalid JSON", () => {
    expect(() => parseJSONData("{oops")).toThrow(/Invalid JSON/);
  });
});
