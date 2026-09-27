import { Store } from "./types";

// All rent figures are in Saudi riyals
export const CURRENCY = "SAR";

export const PIN_SEL = "#38BDF8";

// ── Live / Paid status ──

// Status is read from the first word of the cell ("Paid Jun 2024" → paid, "Not Live" → not live).
// Anything blank or unrecognised counts as not live / unpaid so it stands out, and is listed in dataIssues.
const LIVE_YES = ["yes", "y", "live", "true", "1", "active", "open", "operational", "launched"];
const LIVE_NO = ["no", "n", "not", "false", "0", "closed", "pending", "under", "coming", "upcoming", "soon", "planned", "inactive", "paused", "hold", "suspended"];
const PAID_YES = ["yes", "y", "paid", "true", "1"];
const PAID_NO = ["no", "n", "not", "unpaid", "false", "0", "pending", "overdue", "due", "partial", "partially", "outstanding"];

function readStatus(raw: string | undefined, yes: string[], no: string[]): boolean | null {
  const first = String(raw ?? "").toLowerCase().split(/[^a-z0-9]+/).find(Boolean);
  if (!first) return null;
  if (yes.includes(first)) return true;
  if (no.includes(first)) return false;
  return null;
}

export const isLive = (s: Store) => readStatus(s.live, LIVE_YES, LIVE_NO) === true;

export const isPaid = (s: Store) => readStatus(s.paid, PAID_YES, PAID_NO) === true;

// ── Store checks ──

export const hasCoords = (s: Store) => s.lat !== null && s.lng !== null;

export function pinColor(s: Store): string {
  if (!isLive(s)) return "#f87171"; // Red 400
  return isPaid(s) ? "#4ade80" : "#fbbf24"; // Green 400 or Amber 400
}

/** Problems in a store's source data, shown so they can be fixed in the sheet or file. */
export function dataIssues(s: Store): string[] {
  const issues: string[] = [];
  if (!hasCoords(s)) {
    issues.push(`${s.locationIssue || "No coordinates"}. Not shown on the map.`);
  }
  if (s.rentSARAnnual === null) issues.push("Annual rent is missing.");
  if (!s.size) issues.push("Area is missing.");
  if (!s.startDate) issues.push("Contract start date is missing.");
  if (readStatus(s.live, LIVE_YES, LIVE_NO) === null) {
    issues.push(s.live?.trim() ? `Live status "${s.live.trim()}" isn't recognised. Counted as Not Live.` : "Live status is blank. Counted as Not Live.");
  }
  if (readStatus(s.paid, PAID_YES, PAID_NO) === null) {
    issues.push(s.paid?.trim() ? `Payment status "${s.paid.trim()}" isn't recognised. Counted as Unpaid.` : "Payment status is blank. Counted as Unpaid.");
  }
  return issues;
}

// ── Number formatting ──

const UNITS: Array<[number, string]> = [[1e3, "K"], [1e6, "M"], [1e9, "B"]];

export function fmtN(n: number): string {
  if (Math.round(Math.abs(n)) < 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  // The unit is chosen after rounding, so 999,999 shows as 1.00M rather than 1000K
  for (let i = 0; i < UNITS.length; i++) {
    const [size, suffix] = UNITS[i];
    const v = n / size;
    const digits = suffix === "M" ? 2 : Math.abs(v) < 100 ? 1 : 0;
    const text = v.toFixed(digits);
    if (Math.abs(parseFloat(text)) < 1000 || i === UNITS.length - 1) {
      return (suffix === "M" ? text : text.replace(/\.0$/, "")) + suffix;
    }
  }
  return String(n);
}

export function fmtR(n: number | null): string {
  return n === null ? "—" : fmtN(n);
}
