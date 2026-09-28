import { Store } from "../types";

// Renewal should start this many days before the contract ends
export const RENEWAL_LEAD_DAYS = 75;

// "Renew soon" shows this many days before the renewal start date
export const RENEWAL_WARNING_DAYS = 30;

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * Reads a Gregorian date: "15 Jan 2024", "15 January 2024", "Jan 15, 2024", "2024-01-15"
 * or "15/01/2024" (day first). Returns midnight UTC, or null if the text isn't a date.
 */
export function parseDate(text: string): Date | null {
  const s = text.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ");
  const monthOf = (name: string) => MONTHS.findIndex((m) => name.startsWith(m.toLowerCase())) + 1;
  let r: RegExpMatchArray | null;
  let y: number, m: number, d: number;

  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[ -]([a-z]{3,})\.?[ -](\d{4})$/))) [d, m, y] = [+r[1], monthOf(r[2]), +r[3]];
  else if ((r = s.match(/^([a-z]{3,})\.? (\d{1,2}) (\d{4})$/))) [m, d, y] = [monthOf(r[1]), +r[2], +r[3]];
  else return null;

  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m - 1)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formats a date the way the sheet shows it: "05 Jan 2024". */
export function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Reads a contract duration such as "2 Years", "6 Months" or "1 Year 6 Months" as a number of months. */
export function parseDurationMonths(text: string): number | null {
  let months = 0;
  for (const [, n, unit] of text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|m)\b/g)) {
    months += unit.startsWith("y") ? parseFloat(n) * 12 : parseFloat(n);
  }
  return months > 0 ? Math.round(months) : null;
}

/**
 * Last day of a contract: the day before the same date `months` later ("01 Jan 2024" for 2 years ends
 * "31 Dec 2025"). When that month is too short for the start day, the contract ends on its last day.
 */
export function contractEndDate(start: Date, months: number): Date {
  const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + months) / 12);
  const month = (start.getUTCMonth() + months) % 12;
  const day = start.getUTCDate();
  if (day > daysInMonth(year, month)) return new Date(Date.UTC(year, month, daysInMonth(year, month)));
  return new Date(Date.UTC(year, month, day - 1));
}

export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

export type RenewalStatus = "ok" | "soon" | "now" | "expired" | "unknown";

export interface RenewalInfo {
  status: RenewalStatus;
  endDate: Date | null;
  renewalStart: Date | null;
  daysToEnd: number | null; // negative once the contract has ended
  daysToRenewal: number | null; // negative once renewal should already have started
}

/**
 * ok: renewal starts later · soon: renewal starts within the warning window
 * now: renewal should have started · expired: the contract end date has passed
 */
export function renewalInfo(s: Store, on: Date = today()): RenewalInfo {
  const endDate = s.endDate ? parseDate(s.endDate) : null;
  if (!endDate) return { status: "unknown", endDate: null, renewalStart: null, daysToEnd: null, daysToRenewal: null };

  const renewalStart = new Date(endDate.getTime() - RENEWAL_LEAD_DAYS * DAY_MS);
  const daysToEnd = daysBetween(on, endDate);
  const daysToRenewal = daysBetween(on, renewalStart);
  const status: RenewalStatus =
    daysToEnd < 0 ? "expired" : daysToRenewal <= 0 ? "now" : daysToRenewal <= RENEWAL_WARNING_DAYS ? "soon" : "ok";
  return { status, endDate, renewalStart, daysToEnd, daysToRenewal };
}

export const pluralDays = (n: number) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;
