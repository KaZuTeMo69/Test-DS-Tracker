import { describe, expect, it } from "vitest";
import { rentFigures, sheetRent } from "./rent";
import { parseCSVData } from "./importer";
import { storesToCsv } from "./csvExport";
import { analyseCoverage } from "./coverage";

describe("rent for contracts under 12 months", () => {
  it("6 months: the rent column is the 6-month total; annual ×2, monthly ÷6, rent per m² from the annual", () => {
    // RUHDS17: a 6-month contract whose rent, 670,350, is the 6-month amount
    const r = rentFigures(670350, 6, 500, 9999);
    expect(r).toEqual({ annual: 1340700, monthly: 111725, perSqm: 2681.4, contractValue: 670350, termMonths: 6 });
  });

  it("3 months: annual ×4, monthly ÷3", () => {
    const r = rentFigures(90000, 3, 300, null);
    expect(r.annual).toBe(360000);
    expect(r.monthly).toBe(30000);
    expect(r.perSqm).toBe(1200);
    expect(r.contractValue).toBe(90000);
  });

  it("12 months and 2 years: unchanged (the column is the annual rent, the sheet's rent per m² kept)", () => {
    expect(rentFigures(240000, 12, 400, 610)).toEqual({
      annual: 240000,
      monthly: 20000,
      perSqm: 610,
      contractValue: null,
      termMonths: 12,
    });
    expect(rentFigures(240000, 24, 400, null)).toMatchObject({ annual: 240000, monthly: 20000, perSqm: 600 });
  });

  it("unknown term: the rent is taken as annual", () => {
    expect(rentFigures(240000, null, 400, null)).toMatchObject({ annual: 240000, monthly: 20000, contractValue: null });
    expect(rentFigures(null, 6, 400, null)).toMatchObject({ annual: null, monthly: null, perSqm: null });
  });

  it("is applied on import, and the CSV export keeps the sheet's value so it imports back the same", () => {
    const csv = [
      "Store Name,City,Contract Duration,Contract Start Date,Area (sqm.),Rent/sqm. (SAR),Annual Rent W/O VAT",
      "RUHDS17,Riyadh,0.6,01/01/2026,500,1340.70,670350",
      "Long one,Riyadh,2,01/01/2026,400,600,240000",
    ].join("\n");
    const [short, long] = parseCSVData(csv);
    expect(short).toMatchObject({
      termMonths: 6,
      contractValue: 670350,
      rentSARAnnual: 1340700,
      rentSARMonthly: 111725,
    });
    expect(short.rentSARsqm).toBeCloseTo(2681.4);
    expect(long).toMatchObject({ termMonths: 24, contractValue: null, rentSARAnnual: 240000, rentSARsqm: 600 });
    expect(sheetRent(short)).toBe(670350);

    const out = storesToCsv([short, long], { leadDays: 75, warningDays: 30 }, analyseCoverage([short, long], []));
    const [header, first] = out.replace(/^﻿/, "").split("\r\n");
    const cols = header.split(",");
    const cells = first.split(",");
    expect(cells[cols.indexOf("Annual Rent W/O VAT")]).toBe("670350");
    expect(cells[cols.indexOf("Contract Value")]).toBe("670350");
    expect(cells[cols.indexOf("Annualised Rent")]).toBe("1340700");
    const [again] = parseCSVData(out);
    expect(again.rentSARAnnual).toBe(1340700);
    expect(again.contractValue).toBe(670350);
  });
});
