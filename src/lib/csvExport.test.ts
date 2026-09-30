import { describe, expect, it } from "vitest";
import { Store, Zone, ZoneLayer } from "../types";
import { analyseCoverage } from "./coverage";
import { csvFileName, storesToCsv } from "./csvExport";
import { formatDate, today } from "./contract";
import { parseCSVData } from "./importer";

const days = { leadDays: 75, warningDays: 30 };
const inDays = (n: number) => formatDate(new Date(today().getTime() + n * 86_400_000));

const store = (id: number, over: Partial<Store>): Store => ({
  id,
  name: `Store ${id}`,
  dsCode: `DS-${id}`,
  city: "Riyadh",
  country: "KSA",
  contractDuration: "2",
  startDate: "01 Jan 2025",
  endDate: inDays(100),
  live: "Live",
  paid: "Paid",
  size: 400,
  rentSARAnnual: 240000,
  rentSARMonthly: 20000,
  rentSARsqm: 600,
  lat: 24.7,
  lng: 46.7,
  ...over,
});

const stores = [
  store(1, { name: 'الياسمين, Hub "North"' }),
  store(2, { endDate: inDays(-5), lat: null, lng: null }),
  store(3, { name: '=HYPERLINK("x")', dsCode: "-DS", endDate: "" }),
];
const none = analyseCoverage(stores, []);
const rows = (csv: string) => csv.replace(/^﻿/, "").split("\r\n");

describe("storesToCsv", () => {
  it("starts with a byte-order mark and the sheet's columns, then the worked-out ones", () => {
    const csv = storesToCsv(stores, days, none);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(rows(csv)[0]).toBe(
      "Store Name,City,DS Code,Contract Duration,Paid / Not Paid,Live / Not Live,Contract Start Date," +
        "Contract End Date,Area (sqm.),Rent/sqm. (SAR),Annual Rent W/O VAT,Lat,Lng," +
        "Contract No,Contract Status,Next Payment,Contract Total Value,Region," +
        "Contract Value,Annualised Rent,Days to End,Renewal Starts,Days to Renewal,Renewal Status",
    );
  });

  it("adds the days, renewal start and status", () => {
    const [, first, second, third] = rows(storesToCsv(stores, days, none));
    expect(first.endsWith(`,100,${inDays(25)},25,Renew soon`)).toBe(true);
    expect(second.endsWith(`,-5,${inDays(-80)},-80,Expired`)).toBe(true);
    expect(third.endsWith(",,,,Unknown")).toBe(true);
  });

  it("quotes commas and quotes, and writes formula-like text as plain text", () => {
    const [, first, , third] = rows(storesToCsv(stores, days, none));
    expect(first.startsWith('"الياسمين, Hub ""North""",Riyadh')).toBe(true);
    expect(third.startsWith(`"'=HYPERLINK(""x"")",Riyadh,'-DS,`)).toBe(true);
  });

  it("imports again with every field kept", () => {
    const back = parseCSVData(storesToCsv(stores.slice(0, 2), days, none));
    expect(back).toHaveLength(2);
    const [a, b] = back;
    expect(a.name).toBe(stores[0].name);
    expect([a.city, a.dsCode, a.contractDuration, a.paid, a.live]).toEqual(["Riyadh", "DS-1", "2", "Paid", "Live"]);
    expect([a.startDate, a.endDate]).toEqual(["01 Jan 2025", inDays(100)]);
    expect([a.size, a.rentSARsqm, a.rentSARAnnual, a.lat, a.lng]).toEqual([400, 600, 240000, 24.7, 46.7]);
    expect([b.endDate, b.lat, b.lng]).toEqual([inDays(-5), null, null]);
  });

  it("adds the coverage and white-space zones when there are any on the map", () => {
    const square = (lat: number, lng: number): Zone => ({
      id: `z${lat}`,
      name: lat > 23 ? "Olaya" : "Gap",
      description: "",
      color: null,
      polygons: [
        [
          [
            [lat, lng],
            [lat, lng + 0.2],
            [lat + 0.2, lng + 0.2],
            [lat + 0.2, lng],
          ],
        ],
      ],
    });
    const layer = (kind: ZoneLayer["kind"], zones: Zone[]): ZoneLayer => ({
      id: kind,
      name: kind,
      kind,
      visible: true,
      color: "#FECC00",
      opacity: 0.2,
      source: "",
      created: 0,
      zones,
      lines: [],
    });
    const some = [store(1, {}), store(4, { lat: 21.5, lng: 39.1 }), store(2, { lat: null, lng: null })];
    const coverage = analyseCoverage(some, [
      layer("coverage", [square(24.6, 46.6)]),
      layer("whitespace", [square(21.4, 39.0)]),
    ]);
    const [head, a, b, c] = rows(storesToCsv(some, days, coverage));
    expect(head.endsWith(",Renewal Status,Coverage Zone,White Space Zone")).toBe(true);
    expect(a.endsWith(",Olaya,")).toBe(true);
    expect(b.endsWith(",None,Gap")).toBe(true);
    expect(c.endsWith(",,")).toBe(true); // no location: not checked
    // the zone columns don't get in the way of importing
    expect(parseCSVData(storesToCsv(some, days, coverage)).map((s) => s.name)).toEqual([
      "Store 1",
      "Store 4",
      "Store 2",
    ]);
  });
});

describe("csvFileName", () => {
  it("uses the local date, and says when the file holds only the filtered stores", () => {
    const on = new Date(2026, 8, 29, 23, 30);
    expect(csvFileName(false, on)).toBe("dark_stores_2026-09-29.csv");
    expect(csvFileName(true, on)).toBe("dark_stores_filtered_2026-09-29.csv");
  });
});
