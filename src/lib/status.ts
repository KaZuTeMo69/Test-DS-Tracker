import { Store } from "../types";

// Status is read from the first word of the cell ("Paid Jun 2024" → paid, "Not Live" → not live).
// Anything blank or unrecognised counts as not live / unpaid so it stands out, and is listed in dataIssues.
const LIVE_YES = ["yes", "y", "live", "true", "1", "active", "open", "operational", "launched"];
const LIVE_NO = [
  "no",
  "n",
  "not",
  "false",
  "0",
  "closed",
  "pending",
  "under",
  "coming",
  "upcoming",
  "soon",
  "planned",
  "inactive",
  "paused",
  "hold",
  "suspended",
];
const PAID_YES = ["yes", "y", "paid", "true", "1"];
const PAID_NO = [
  "no",
  "n",
  "not",
  "unpaid",
  "false",
  "0",
  "pending",
  "overdue",
  "due",
  "partial",
  "partially",
  "outstanding",
];

function readStatus(raw: string | undefined, yes: string[], no: string[]): boolean | null {
  const first = String(raw ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .find(Boolean);
  if (!first) return null;
  if (yes.includes(first)) return true;
  if (no.includes(first)) return false;
  return null;
}

// true / false, or null when the status is blank or not recognised
export const liveStatus = (s: Store) => readStatus(s.live, LIVE_YES, LIVE_NO);
export const paidStatus = (s: Store) => readStatus(s.paid, PAID_YES, PAID_NO);

export const isLive = (s: Store) => readStatus(s.live, LIVE_YES, LIVE_NO) === true;

export const isPaid = (s: Store) => readStatus(s.paid, PAID_YES, PAID_NO) === true;

// Live or Payment status blank or not recognised, so the store is counted as Not Live / Unpaid on a guess
export const hasUnclearStatus = (s: Store) => liveStatus(s) === null || paidStatus(s) === null;
