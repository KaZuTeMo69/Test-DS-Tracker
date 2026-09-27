import { Store } from "./types";

export const PIN_SEL = "#38BDF8";

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

export const hasCoords = (s: Store) => s.lat !== null && s.lng !== null;

export function pn(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function fmtN(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function getRent(s: Store, currency: "USD" | "AED" | "SAR"): number | null {
  if (currency === "AED") return s.rentAEDAnnual;
  if (currency === "SAR") return s.rentSARAnnual;
  return s.rentUSDAnnual;
}

export function fmtR(v: string | number | null | undefined): string {
  const n = pn(v);
  if (n === null) return String(v ?? "—");
  return n >= 1000 ? (n / 1000).toFixed(0) + "K" : String(Math.round(n));
}

/** Problems in a store's source data, shown so they can be fixed in the sheet or file. */
export function dataIssues(s: Store): string[] {
  const issues: string[] = [];
  if (s.lat === null || s.lng === null) {
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

export function pinColor(s: Store): string {
  if (!isLive(s)) return "#f87171"; // Red 400
  return isPaid(s) ? "#4ade80" : "#fbbf24"; // Green 400 or Amber 400
}
