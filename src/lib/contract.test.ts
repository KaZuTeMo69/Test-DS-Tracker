import { describe, expect, it } from "vitest";
import { Store } from "../types";
import {
  contractEndDate,
  daysBetween,
  formatDate,
  formatDuration,
  parseDate,
  parseDurationMonths,
  pluralDays,
  RENEWAL_LEAD_DAYS,
  RENEWAL_WARNING_DAYS,
  renewalInfo,
} from "./contract";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));
const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

const store = (endDate: string): Store => ({
  id: 1,
  name: "Test",
  dsCode: "",
  city: "Riyadh",
  country: "KSA",
  contractDuration: "",
  startDate: "",
  endDate,
  size: null,
  rentSARAnnual: null,
  rentSARMonthly: null,
  rentSARsqm: null,
  lat: null,
  lng: null,
});

describe("parseDate", () => {
  it.each([
    ["15 Jan 2024", "2024-01-15"],
    ["15 January 2024", "2024-01-15"],
    ["5 jan 2024", "2024-01-05"],
    ["15-Jan-2024", "2024-01-15"],
    ["05 Sept 2024", "2024-09-05"], // how Google formats September in English (UK)
    ["Jan 15, 2024", "2024-01-15"],
    ["January 15 2024", "2024-01-15"],
    ["2024-01-15", "2024-01-15"],
    ["2024/1/5", "2024-01-05"],
    ["2024-01-15T10:30:00Z", "2024-01-15"],
    ["15/01/2024", "2024-01-15"],
    ["15-01-2024", "2024-01-15"],
    ["15.01.2024", "2024-01-15"],
    ["  15/01/2024  ", "2024-01-15"],
    ["29 Feb 2024", "2024-02-29"],
  ])("reads %j", (text, expected) => {
    expect(iso(parseDate(text))).toBe(expected);
  });

  it("reads numeric dates day first", () => {
    expect(iso(parseDate("05/06/2024"))).toBe("2024-06-05");
    expect(parseDate("01/15/2024")).toBeNull(); // month 15 doesn't exist
  });

  it.each([
    "",
    "abc",
    "31/02/2024", // 31 February
    "29 Feb 2023", // not a leap year
    "2024-13-01",
    "00 Jan 2024",
    "32/01/2024",
    "15/01/24", // two-digit year
    "45306", // spreadsheet serial number
    "1446/03/15", // Hijri, not read yet
    "15 Foo 2024",
  ])("rejects %j", (text) => {
    expect(parseDate(text)).toBeNull();
  });

  it("returns midnight UTC", () => {
    expect(parseDate("15 Jan 2024")!.getTime()).toBe(utc(2024, 1, 15).getTime());
  });
});

describe("formatDate", () => {
  it("writes two-digit days and short month names", () => {
    expect(formatDate(utc(2024, 1, 5))).toBe("05 Jan 2024");
    expect(formatDate(utc(2025, 12, 31))).toBe("31 Dec 2025");
  });

  it("round-trips through parseDate", () => {
    const d = utc(2027, 3, 14);
    expect(parseDate(formatDate(d))!.getTime()).toBe(d.getTime());
  });
});

describe("parseDurationMonths", () => {
  it.each([
    ["2", 24], // a bare number is years
    ["1", 12],
    ["1.5", 18],
    [" 3 ", 36],
    ["2 Years", 24],
    ["1 year", 12],
    ["2 yrs", 24],
    ["2y", 24],
    ["6 Months", 6],
    ["6 months", 6],
    ["18 mos", 18],
    ["24M", 24],
    ["1 year 6 months", 18],
    ["1 Year, 6 Months", 18],
  ])("reads %j as %i months", (text, months) => {
    expect(parseDurationMonths(text)).toBe(months);
  });

  it.each(["", "0", "0 months", "Two years", "TBD", "-"])("rejects %j", (text) => {
    expect(parseDurationMonths(text)).toBeNull();
  });

  it.todo('flags a duration with an option period such as "2+1 years" instead of reading it as 1 year');
});

describe("formatDuration", () => {
  it("adds the unit to a bare number", () => {
    expect(formatDuration("2")).toBe("2 years");
    expect(formatDuration("1")).toBe("1 year");
    expect(formatDuration("1.5")).toBe("1.5 years");
  });

  it("leaves anything else as written", () => {
    expect(formatDuration("6 Months")).toBe("6 Months");
    expect(formatDuration(" 2 Years ")).toBe("2 Years");
  });
});

describe("contractEndDate", () => {
  it.each([
    ["01 Jan 2024", 24, "2025-12-31"],
    ["15 Mar 2024", 36, "2027-03-14"],
    ["15 Nov 2024", 3, "2025-02-14"], // into the next year
    ["01 Mar 2024", 12, "2025-02-28"],
    ["01 Mar 2024", 1, "2024-03-31"],
    ["31 Jan 2024", 1, "2024-02-29"], // no 31 February: ends on the month's last day (leap year)
    ["31 Jan 2025", 1, "2025-02-28"],
    ["30 Jan 2025", 1, "2025-02-28"],
    ["29 Feb 2024", 12, "2025-02-28"],
    ["31 Mar 2024", 1, "2024-04-30"],
    ["31 Dec 2024", 2, "2025-02-28"],
    ["31 Jan 2024", 12, "2025-01-30"],
  ])("%s + %i months ends %s", (start, months, end) => {
    expect(iso(contractEndDate(parseDate(start)!, months))).toBe(end);
  });
});

describe("daysBetween and pluralDays", () => {
  it("counts whole days, negative when the second date is earlier", () => {
    expect(daysBetween(utc(2024, 1, 1), utc(2024, 3, 1))).toBe(60);
    expect(daysBetween(utc(2024, 3, 1), utc(2024, 1, 1))).toBe(-60);
  });

  it("uses the singular for one day", () => {
    expect(pluralDays(1)).toBe("1 day");
    expect(pluralDays(-1)).toBe("-1 day");
    expect(pluralDays(2)).toBe("2 days");
  });
});

describe("renewalInfo", () => {
  const today = utc(2026, 9, 28);
  const endingIn = (days: number) => renewalInfo(store(formatDate(addDays(today, days))), today);

  it("is unknown without a readable end date", () => {
    expect(renewalInfo(store(""), today).status).toBe("unknown");
    expect(renewalInfo(store("31/02/2026"), today)).toEqual({
      status: "unknown",
      endDate: null,
      renewalStart: null,
      daysToEnd: null,
      daysToRenewal: null,
    });
  });

  it(`starts renewal ${RENEWAL_LEAD_DAYS} days before the end date`, () => {
    const info = endingIn(200);
    expect(info.daysToEnd).toBe(200);
    expect(info.daysToRenewal).toBe(200 - RENEWAL_LEAD_DAYS);
    expect(iso(info.renewalStart)).toBe(iso(addDays(today, 200 - RENEWAL_LEAD_DAYS)));
  });

  it("is ok while renewal is more than the warning window away", () => {
    expect(endingIn(RENEWAL_LEAD_DAYS + RENEWAL_WARNING_DAYS + 1).status).toBe("ok");
  });

  it(`is soon within ${RENEWAL_WARNING_DAYS} days of the renewal start`, () => {
    expect(endingIn(RENEWAL_LEAD_DAYS + RENEWAL_WARNING_DAYS).status).toBe("soon");
    expect(endingIn(RENEWAL_LEAD_DAYS + 1).status).toBe("soon");
  });

  it("is now from the renewal start until the last day of the contract", () => {
    expect(endingIn(RENEWAL_LEAD_DAYS).status).toBe("now"); // renewal starts today
    expect(endingIn(10).status).toBe("now");
    expect(endingIn(0).status).toBe("now"); // ends today
  });

  it("is expired once the end date has passed", () => {
    const info = endingIn(-1);
    expect(info.status).toBe("expired");
    expect(info.daysToEnd).toBe(-1);
  });
});
