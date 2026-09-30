import { describe, expect, it } from "vitest";
import { Store } from "../types";
import { isSheetError, parseCSVData, rowsToStores } from "./importer";
import { cellText } from "./sheets";
import { dataQuality, datesMismatch, storeIssues, totalMismatch } from "./checks";
import { paymentCounts, paymentInfo } from "./payments";

// The store sheet's contract register columns (filled by lookup formulas), with the headers as they are
const HEADERS = [
  "Store Name",
  "City",
  "DS Code",
  "Contract No",
  "Contract Status",
  "Contract Duration",
  "Paid / Not Paid",
  "Live / Not Live",
  "Contract Start Date",
  "Contract End Date",
  "Next Payment",
  "Annual Rent W/O VAT",
  "Contract Total Value",
  "Region",
  "Lat",
  "Lng",
];
const row = (over: Record<string, string>) =>
  HEADERS.map(
    (h) =>
      over[h] ??
      {
        "Store Name": "Olaya Hub",
        City: "Riyadh",
        "DS Code": "RUHDS01",
        "Contract No": "C-2025-014",
        "Contract Status": "Active",
        "Contract Duration": "2",
        "Paid / Not Paid": "Paid",
        "Live / Not Live": "Live",
        "Contract Start Date": "01/01/2025",
        "Contract End Date": "31/12/2026",
        "Next Payment": "01/01/2026",
        "Annual Rent W/O VAT": "200,000",
        "Contract Total Value": "SAR 460,000",
        Region: "Central",
        Lat: "24.69",
        Lng: "46.68",
      }[h] ??
      "",
  );

describe("contract register columns", () => {
  it("reads Contract No, Contract Status, Next Payment, Contract Total Value (SAR and commas stripped) and Region", () => {
    const [s] = rowsToStores(HEADERS, [row({})]);
    expect(s).toMatchObject({
      contractNo: "C-2025-014",
      contractStatus: "Active",
      nextPayment: "01 Jan 2026",
      contractTotal: 460000,
      region: "Central",
      // The old columns still go where they did: "Contract Status" isn't taken for Live, "Next Payment" not for Paid
      live: "Live",
      paid: "Paid",
    });
  });

  it('also reads "Next payments"', () => {
    const headers = ["Store Name", "Next payments", "Payment Status"];
    const [s] = rowsToStores(headers, [["A", "15/02/2026", "Paid"]]);
    expect(s.nextPayment).toBe("15 Feb 2026");
    expect(s.paid).toBe("Paid");
  });
});

describe("spreadsheet errors", () => {
  it.each(["#N/A", "#REF!", "#VALUE!", "#DIV/0!", "#NAME?", "#NUM!", "#NULL!", "#ERROR!", "#SPILL!", " #n/a "])(
    "%j is a spreadsheet error",
    (v) => expect(isSheetError(v)).toBe(true),
  );
  it.each(["N/A", "#1", "#hash tag", "Active", "", "#"])("%j isn't", (v) => expect(isSheetError(v)).toBe(false));

  it("reads them as empty: the end date falls back to start + duration, and they're listed in Data Quality", () => {
    const [s] = rowsToStores(HEADERS, [
      row({ "Contract End Date": "#N/A", "Contract Total Value": "#REF!", "Next Payment": "#N/A" }),
    ]);
    expect(s.endDate).toBe("31 Dec 2026"); // 01 Jan 2025 + 2 years
    expect(s.contractTotal).toBeNull();
    expect(s.nextPayment).toBe("");
    expect(s.sheetErrors).toEqual([
      { column: "Contract End Date", value: "#N/A" },
      { column: "Next Payment", value: "#N/A" },
      { column: "Contract Total Value", value: "#REF!" },
    ]);
    const issues = storeIssues(s).filter((i) => i.kind === "sheetError");
    expect(issues.map((i) => i.text)).toEqual([
      '"Contract End Date" is #N/A in the sheet, so it\'s read as empty.',
      '"Next Payment" is #N/A in the sheet, so it\'s read as empty.',
      '"Contract Total Value" is #REF! in the sheet, so it\'s read as empty.',
    ]);
    expect(dataQuality([s]).groups.map((g) => g.kind)).toContain("sheetError");
  });

  it("from Google Sheets too, where an error can come with no value and only the displayed text", () => {
    expect(cellText({ v: null, f: "#N/A" })).toBe("#N/A");
    expect(cellText({ v: null, f: null })).toBe("");
    expect(cellText({ v: "#REF!" })).toBe("#REF!");
  });
});

describe("duplicate headers", () => {
  it("prefer the one with data (City empty, Location filled)", () => {
    const [s] = rowsToStores(["Store Name", "City", "Location"], [["A", "", "Jeddah"]]);
    expect(s.city).toBe("Jeddah");
  });

  it("keep the first when both have data, or neither does", () => {
    expect(rowsToStores(["Store Name", "City", "Location"], [["A", "Riyadh", "Olaya"]])[0].city).toBe("Riyadh");
    expect(rowsToStores(["Store Name", "City", "Location"], [["A", "", ""]])[0].city).toBe("");
  });

  it("a column of errors counts as no data", () => {
    const [s] = rowsToStores(["Store Name", "City", "Location"], [["A", "#N/A", "Dammam"]]);
    expect(s.city).toBe("Dammam");
  });

  it("the column left over still goes to its own field", () => {
    const csv = "Store Name,DS Code,Code,Annual Rent W/O VAT\nA,,RUH-9,100000";
    const [s] = parseCSVData(csv);
    expect(s.dsCode).toBe("RUH-9");
    expect(s.rentSARAnnual).toBe(100000);
  });
});

const store = (over: Partial<Store>): Store => ({
  id: 1,
  name: "S",
  dsCode: "DS-1",
  city: "Riyadh",
  country: "KSA",
  contractDuration: "2",
  startDate: "01 Jan 2025",
  endDate: "31 Dec 2026",
  live: "Live",
  paid: "Paid",
  size: 400,
  rentSARAnnual: 200000,
  rentSARMonthly: 16667,
  rentSARsqm: 500,
  lat: 24.7,
  lng: 46.7,
  termMonths: 24,
  ...over,
});

describe("Contract Total Value against the rent", () => {
  it("agrees within 2%: annual × years × 1.15", () => {
    expect(totalMismatch(store({ contractTotal: 460000 }))).toBeNull();
    expect(totalMismatch(store({ contractTotal: 469000 }))).toBeNull(); // +1.96%
  });

  it("flags more than 2% either way, saying by how much", () => {
    const high = totalMismatch(store({ contractTotal: 480000 }))!;
    expect(high.expected).toBeCloseTo(460000);
    expect(high.diff).toBeCloseTo(0.0435, 3);
    expect(storeIssues(store({ contractTotal: 400000 })).find((i) => i.kind === "totalMismatch")?.text).toBe(
      "Contract Total Value SAR 400,000 is 13% less than annual rent × term × 1.15 (SAR 460,000).",
    );
  });

  it("uses the annualised rent for a short contract", () => {
    // 6 months: 670,350 for the term → 1,340,700 a year → × 0.5 year × 1.15 = 770,902.5
    const s = store({ contractDuration: "0.6", termMonths: 6, rentSARAnnual: 1340700, contractValue: 670350 });
    expect(totalMismatch({ ...s, contractTotal: 770903 })).toBeNull();
    expect(totalMismatch({ ...s, contractTotal: 670350 })).not.toBeNull(); // VAT left out
  });

  it("says nothing without a total, a rent or a term", () => {
    expect(totalMismatch(store({ contractTotal: null }))).toBeNull();
    expect(totalMismatch(store({ contractTotal: 1, rentSARAnnual: null }))).toBeNull();
    expect(totalMismatch(store({ contractTotal: 1, termMonths: null, contractDuration: "" }))).toBeNull();
  });
});

describe("contract dates against the duration", () => {
  it("agree within a month", () => {
    expect(datesMismatch(store({}))).toBeNull();
    expect(datesMismatch(store({ endDate: "20 Jan 2027" }))).toBeNull(); // 20 days out
  });

  it("flag more than a month apart", () => {
    const m = datesMismatch(store({ endDate: "31 Dec 2027" }))!;
    expect(m.days).toBe(365);
    expect(storeIssues(store({ endDate: "31 Mar 2026" })).find((i) => i.kind === "datesMismatch")?.text).toBe(
      "The start date plus 2 years ends 31 Dec 2026, but the end date is 31 Mar 2026 (275 days earlier).",
    );
  });

  it("an end date that includes the option period is fine (2+1 years)", () => {
    expect(datesMismatch(store({ contractDuration: "2+1 years", endDate: "31 Dec 2027" }))).toBeNull();
    expect(datesMismatch(store({ contractDuration: "2+1 years", endDate: "31 Dec 2026" }))).toBeNull();
  });

  it("says nothing without both dates and a duration", () => {
    expect(datesMismatch(store({ endDate: "" }))).toBeNull();
    expect(datesMismatch(store({ contractDuration: "TBD" }))).toBeNull();
  });
});

describe("payments", () => {
  const on = new Date(Date.UTC(2026, 0, 10)); // 10 Jan 2026

  it("due within 30 days is a warning; past due is overdue", () => {
    expect(paymentInfo(store({ nextPayment: "15 Jan 2026" }), on)).toMatchObject({ status: "due", days: 5 });
    expect(paymentInfo(store({ nextPayment: "09 Feb 2026" }), on)).toMatchObject({ status: "due", days: 30 });
    expect(paymentInfo(store({ nextPayment: "10 Feb 2026" }), on)).toMatchObject({ status: "later", days: 31 });
    expect(paymentInfo(store({ nextPayment: "01 Jan 2026" }), on)).toMatchObject({ status: "overdue", days: -9 });
    expect(paymentInfo(store({ nextPayment: "" }), on).status).toBe("none");
    expect(paymentInfo(store({ nextPayment: "soon" }), on).status).toBe("none");
  });

  it("an ended contract owes nothing more", () => {
    expect(paymentInfo(store({ nextPayment: "01 Jan 2026", contractStatus: "Terminated" }), on).status).toBe("none");
  });

  it("counts due and overdue", () => {
    const stores = ["15 Jan 2026", "01 Jan 2026", "05 Jan 2026", "01 Jun 2026", ""].map((d, i) =>
      store({ id: i, nextPayment: d }),
    );
    expect(paymentCounts(stores, on)).toEqual({ due: 1, overdue: 2 });
  });

  it("an unreadable next payment date is in Data Quality", () => {
    expect(storeIssues(store({ nextPayment: "soon" })).map((i) => i.kind)).toEqual(["paymentUnreadable"]);
  });
});
