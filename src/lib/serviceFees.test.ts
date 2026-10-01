import { describe, expect, it } from "vitest";
import { rowsToStores, storeColumnFields } from "./importer";
import { totalMismatch, storeIssues } from "./checks";
import { contractTermValue, serviceFeesAnnual, sheetServiceFees } from "./rent";
import { storesToCsv } from "./csvExport";
import { analyseCoverage } from "./coverage";
import { DEFAULT_SETTINGS } from "./settings";

const HEADERS = [
  "Store Name",
  "City",
  "Contract Duration",
  "Paid / Not Paid",
  "Live / Not Live",
  "Contract Start Date",
  "Annual Rent W/O VAT",
  "Service Fees",
  "Contract Total Value",
];
const store = (duration: string, rent: string, service: string, total = "") =>
  rowsToStores(HEADERS, [["Olaya", "Riyadh", duration, "Paid", "Live", "01/01/2025", rent, service, total]])[0];

describe("service fees", () => {
  it("are read from a Service Fees column (or Service Charge / Service Payments), not taken for the rent or Paid", () => {
    expect(storeColumnFields(HEADERS)).toEqual([
      "name",
      "city",
      "duration",
      "paid",
      "live",
      "startDate",
      "rentAnnual",
      "serviceFees",
      "contractTotal",
    ]);
    for (const h of ["Service Charge", "Service Payments", "Annual Service Fees W/O VAT", "Service Fee (SAR)"])
      expect(storeColumnFields(["Store Name", "Paid", "Annual Rent", h])).toEqual([
        "name",
        "paid",
        "rentAnnual",
        "serviceFees",
      ]);
    // A monthly figure isn't read as the yearly one
    expect(storeColumnFields(["Store Name", "Monthly Service Fee"])).toEqual(["name", null]);
  });

  it("are a year's, or the term's total for a contract under 12 months, like the rent", () => {
    expect(store("2", "200,000", "40,000").serviceFeesAnnual).toBe(40000);
    // 6 months: 100,000 rent and 20,000 service for the term → 200,000 and 40,000 a year
    const short = store("0.6", "100,000", "20,000");
    expect(short).toMatchObject({ rentSARAnnual: 200000, serviceFeesAnnual: 40000 });
    expect(sheetServiceFees(short)).toBe(20000);
    expect(serviceFeesAnnual(null, 6)).toBeNull();
    expect(store("2", "200,000", "").serviceFeesAnnual).toBeNull();
  });

  it("stay out of the rent figures", () => {
    const s = store("2", "200,000", "40,000");
    expect(s).toMatchObject({ rentSARAnnual: 200000, rentSARMonthly: 200000 / 12 });
  });

  it("count in the contract value: (rent + service fees) × term, without VAT", () => {
    expect(contractTermValue(store("2", "200,000", "40,000"))).toBe(480000);
    expect(contractTermValue(store("0.6", "100,000", "20,000"))).toBe(120000);
    expect(contractTermValue(store("2", "200,000", ""))).toBe(400000);
    expect(contractTermValue(store("unknown", "200,000", "40,000"))).toBeNull();
  });

  it("count in the Contract Total Value check: (rent + service fees) × term × 1.15", () => {
    // 480,000 × 1.15 = 552,000: matches with the service fees, and would be 20% over without them
    expect(totalMismatch(store("2", "200,000", "40,000", "552,000"))).toBeNull();
    const without = store("2", "200,000", "", "552,000");
    expect(totalMismatch(without)?.diff).toBeCloseTo(0.2, 5);
    const off = store("2", "200,000", "40,000", "600,000");
    expect(storeIssues(off).find((i) => i.kind === "totalMismatch")?.text).toMatch(
      /than \(annual rent \+ service fees\) × term × 1\.15 \(SAR 552,000\)/,
    );
  });

  it("are exported as in the sheet, with the contract value", () => {
    const stores = [store("2", "200,000", "40,000"), store("0.6", "100,000", "20,000")];
    const lines = storesToCsv(stores, DEFAULT_SETTINGS, analyseCoverage(stores, [])).replace(/^﻿/, "").split("\r\n");
    const head = lines[0].split(",");
    const at = (line: string, h: string) => line.split(",")[head.indexOf(h)];
    expect([at(lines[1], "Service Fees"), at(lines[1], "Contract Value")]).toEqual(["40000", "480000"]);
    expect([at(lines[2], "Service Fees"), at(lines[2], "Contract Value"), at(lines[2], "Annual Rent W/O VAT")]).toEqual(
      ["20000", "120000", "100000"],
    );
    // And they read back the same
    const back = rowsToStores(
      head,
      lines.slice(1).map((l) => l.split(",")),
    );
    expect(back.map((s) => s.serviceFeesAnnual)).toEqual([40000, 40000]);
  });
});
