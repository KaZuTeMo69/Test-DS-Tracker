import { Store } from "../types";

// Renewal should start this many days before the contract ends
export const RENEWAL_LEAD_DAYS = 75;

// "Renew soon" shows this many days before the renewal start date
export const RENEWAL_WARNING_DAYS = 30;

/** The two numbers above; both can be changed in Settings. */
export interface RenewalDays {
  leadDays: number;
  warningDays: number;
}

const DEFAULT_DAYS: RenewalDays = { leadDays: RENEWAL_LEAD_DAYS, warningDays: RENEWAL_WARNING_DAYS };

const DAY_MS = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// ── Hijri (Umm al-Qura) dates ──

// Hijri years in use: 1300–1600 AH is 1882–2174, the range the Umm al-Qura calendar covers. Gregorian years
// are read from 1900, so a year can't be taken for the wrong calendar
const HIJRI_YEARS = [1300, 1600];
// Written after the date: هـ (or ه) for Hijri and م for Gregorian, or AH / H and AD / CE after a space
const HIJRI_MARK = /\s*هـ?$|\s+(?:a\.?h\.?|h)$/;
const GREGORIAN_MARK = /\s*م$|\s+(?:a\.?d\.?|ce)$/;

let hijriFormat: Intl.DateTimeFormat | null | undefined;

// The browser's Umm al-Qura calendar, or null where it isn't available (Hijri dates then aren't read)
function umalqura(): Intl.DateTimeFormat | null {
  if (hijriFormat === undefined) {
    try {
      const f = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
        timeZone: "UTC",
        year: "numeric",
        month: "numeric",
        day: "numeric",
      });
      hijriFormat = f.resolvedOptions().calendar === "islamic-umalqura" ? f : null;
    } catch {
      hijriFormat = null;
    }
  }
  return hijriFormat;
}

function hijriOf(date: Date, f: Intl.DateTimeFormat) {
  const part = (type: string) => parseInt(f.formatToParts(date).find((p) => p.type === type)?.value ?? "", 10);
  return { y: part("year"), m: part("month"), d: part("day") };
}

// Average lengths, for the first guess; the calendar itself then settles the exact day
const HIJRI_YEAR_DAYS = 354.367;
const HIJRI_MONTH_DAYS = 29.5306;
const HIJRI_EPOCH = Date.UTC(622, 6, 16);

/** The Gregorian date of a Hijri (Umm al-Qura) date, or null if that day doesn't exist (such as the 30th of a 29-day month). */
export function fromHijri(y: number, m: number, d: number): Date | null {
  const f = umalqura();
  if (!f || y < HIJRI_YEARS[0] || y > HIJRI_YEARS[1] || m < 1 || m > 12 || d < 1 || d > 30) return null;
  const serial = (h: { y: number; m: number; d: number }) =>
    (h.y - 1) * HIJRI_YEAR_DAYS + (h.m - 1) * HIJRI_MONTH_DAYS + (h.d - 1);
  const target = { y, m, d };
  let time = HIJRI_EPOCH + Math.round(serial(target)) * DAY_MS;
  for (let i = 0; i < 4; i++) {
    const h = hijriOf(new Date(time), f);
    if (h.y === y && h.m === m && h.d === d) return new Date(time);
    time += Math.round(serial(target) - serial(h)) * DAY_MS;
  }
  // Settle on the exact day near the estimate
  for (const shift of [0, -1, 1, -2, 2]) {
    const candidate = new Date(time + shift * DAY_MS);
    const h = hijriOf(candidate, f);
    if (h.y === y && h.m === m && h.d === d) return candidate;
  }
  return null;
}

// Arabic-Indic (٠١٢…) and Persian (۰۱۲…) digits as 0–9
const westernDigits = (text: string) => text.replace(/[٠-٩۰-۹]/g, (c) => String((c.charCodeAt(0) - 0x0660) % 0x90));

/**
 * Reads a date: Gregorian ("15 Jan 2024", "15 January 2024", "Jan 15, 2024", "2024-01-15" or "15/01/2024", day
 * first) or Hijri Umm al-Qura ("1445/09/01", "01/09/1445", with or without هـ / AH), in Western or Arabic digits.
 * Hijri dates are turned into their Gregorian day. Returns midnight UTC, or null if the text isn't a date.
 */
export function parseDate(text: string): Date | null {
  // Right-to-left marks, which spreadsheets often add around Arabic text, are dropped first
  let s = westernDigits(text.replace(/[\u200e\u200f\u061c]/g, ""))
    .trim()
    .toLowerCase()
    .replace(/,/g, " ")
    .replace(/\s+/g, " ");
  const hijriMarked = HIJRI_MARK.test(s);
  s = s.replace(HIJRI_MARK, "").replace(GREGORIAN_MARK, "");
  const monthOf = (name: string) => MONTHS.findIndex((m) => name.startsWith(m.toLowerCase())) + 1;
  let r: RegExpMatchArray | null;
  let y: number, m: number, d: number;
  let numeric = true;

  if ((r = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) [y, m, d] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) [d, m, y] = [+r[1], +r[2], +r[3]];
  else if ((r = s.match(/^(\d{1,2})[ -]([a-z]{3,})\.?[ -](\d{4})$/))) {
    [d, m, y] = [+r[1], monthOf(r[2]), +r[3]];
    numeric = false;
  } else if ((r = s.match(/^([a-z]{3,})\.? (\d{1,2}) (\d{4})$/))) {
    [m, d, y] = [monthOf(r[1]), +r[2], +r[3]];
    numeric = false;
  } else return null;

  // Hijri: marked as such, or a numeric date with a Hijri year
  if (numeric && (hijriMarked || (y >= HIJRI_YEARS[0] && y <= HIJRI_YEARS[1]))) return fromHijri(y, m, d);
  if (hijriMarked) return null;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m - 1)) return null;
  return new Date(Date.UTC(y, m - 1, d));
}

/** Formats a date the way the sheet shows it: "05 Jan 2024". */
export function formatDate(date: Date): string {
  return `${String(date.getUTCDate()).padStart(2, "0")} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

// A duration that is only a number is in years ("2" = 2 years); months are always written out ("6 months")
const BARE_YEARS = /^\d+(?:\.\d+)?$/;

/** Reads a contract duration such as "2", "2 Years", "6 Months" or "1 Year 6 Months" as a number of months. */
export function parseDurationMonths(text: string): number | null {
  const bare = text.trim();
  if (BARE_YEARS.test(bare)) {
    const months = Math.round(parseFloat(bare) * 12);
    return months > 0 ? months : null;
  }
  let months = 0;
  for (const [, n, unit] of text.toLowerCase().matchAll(/(\d+(?:\.\d+)?)\s*(years?|yrs?|y|months?|mos?|m)\b/g)) {
    months += unit.startsWith("y") ? parseFloat(n) * 12 : parseFloat(n);
  }
  return months > 0 ? Math.round(months) : null;
}

/** How a duration reads on screen: a bare number gets its unit ("2" → "2 years"), anything else stays as written. */
export function formatDuration(text: string): string {
  const bare = text.trim();
  if (!BARE_YEARS.test(bare)) return bare;
  return `${bare} ${parseFloat(bare) === 1 ? "year" : "years"}`;
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

export const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

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
export function renewalInfo(s: Store, on: Date = today(), days: RenewalDays = DEFAULT_DAYS): RenewalInfo {
  const endDate = s.endDate ? parseDate(s.endDate) : null;
  if (!endDate) return { status: "unknown", endDate: null, renewalStart: null, daysToEnd: null, daysToRenewal: null };

  const renewalStart = new Date(endDate.getTime() - days.leadDays * DAY_MS);
  const daysToEnd = daysBetween(on, endDate);
  const daysToRenewal = daysBetween(on, renewalStart);
  const status: RenewalStatus =
    daysToEnd < 0 ? "expired" : daysToRenewal <= 0 ? "now" : daysToRenewal <= days.warningDays ? "soon" : "ok";
  return { status, endDate, renewalStart, daysToEnd, daysToRenewal };
}

export const pluralDays = (n: number) => `${n} ${Math.abs(n) === 1 ? "day" : "days"}`;
