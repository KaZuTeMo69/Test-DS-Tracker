import { Store } from "../types";
import {
  contractEndDate,
  daysBetween,
  durationOptionMonths,
  durationTerm,
  formatDate,
  isAmbiguousDuration,
  monthsText,
  parseDate,
  parseDurationMonths,
} from "./contract";
import { VAT_RATE } from "./settings";
import { contractTermValue } from "./rent";
import { liveStatus, paidStatus } from "./status";

export const hasCoords = (s: Store) => s.lat !== null && s.lng !== null;

/** The kinds of problem a store's data can have; the Data Quality panel groups stores by these. */
export type IssueKind =
  | "location"
  | "rent"
  | "area"
  | "startMissing"
  | "startUnreadable"
  | "endUnreadable"
  | "durationMissing"
  | "durationUnknown"
  | "durationAmbiguous"
  | "liveStatus"
  | "paidStatus"
  | "sheetError"
  | "paymentUnreadable"
  | "totalMismatch"
  | "datesMismatch"
  | "opdMissing"
  | "opdNotLive";

// Contract Total Value (with VAT) may differ from annual rent × term × 1.15 by this much before it's flagged
export const TOTAL_TOLERANCE = 0.02;
// The end date may differ from start date + duration by this many days (about a month) before it's flagged
export const DATES_TOLERANCE_DAYS = 31;

export interface Issue {
  kind: IssueKind;
  text: string; // what's wrong with this store, as shown in its card
}

function contractIssues(s: Store): Issue[] {
  const issues: Issue[] = [];
  const startOk = !!s.startDate && !!parseDate(s.startDate);
  if (!s.startDate) issues.push({ kind: "startMissing", text: "Contract start date is missing." });
  else if (!startOk)
    issues.push({ kind: "startUnreadable", text: `Contract start date "${s.startDate}" isn't a recognised date.` });

  if (s.endDate) {
    if (!parseDate(s.endDate))
      issues.push({ kind: "endUnreadable", text: `Contract end date "${s.endDate}" isn't a recognised date.` });
    // The end date is there, but the term decides whether the rent is annual or a short contract's total
    if (s.contractDuration.trim() && !parseDurationMonths(s.contractDuration))
      issues.push({
        kind: "durationUnknown",
        text: `Contract duration "${s.contractDuration.trim()}" isn't recognised, so the rent is taken as annual.`,
      });
  } else if (startOk) {
    // (A readable duration gives the end date, so then there's nothing to report)
    if (!s.contractDuration.trim())
      issues.push({
        kind: "durationMissing",
        text: "Contract duration is missing, so the end date can't be worked out.",
      });
    else if (!parseDurationMonths(s.contractDuration))
      issues.push({
        kind: "durationUnknown",
        text: `Contract duration "${s.contractDuration.trim()}" isn't recognised, so the end date can't be worked out.`,
      });
  }
  return issues;
}

/**
 * Contract Total Value (from the register, with 15% VAT) against the contract's value: (annual rent + annual service
 * fees, both annualised for a short contract) × the term in years × 1.15. Null when something's missing or they
 * agree within TOTAL_TOLERANCE.
 */
export function totalMismatch(s: Store): { expected: number; diff: number } | null {
  const months = s.termMonths ?? parseDurationMonths(s.contractDuration);
  if (!s.contractTotal || s.rentSARAnnual === null || !months) return null;
  const expected = (contractTermValue({ ...s, termMonths: months }) ?? 0) * (1 + VAT_RATE);
  const diff = (s.contractTotal - expected) / expected;
  return Math.abs(diff) > TOTAL_TOLERANCE ? { expected, diff } : null;
}

/**
 * The end date against start date + duration (or + the term and its options, "2+1 years"): null when they agree
 * within DATES_TOLERANCE_DAYS, or when a date or the duration is missing.
 */
export function datesMismatch(s: Store): { expectedEnd: Date; days: number } | null {
  const start = s.startDate ? parseDate(s.startDate) : null;
  const end = s.endDate ? parseDate(s.endDate) : null;
  const term = parseDurationMonths(s.contractDuration);
  if (!start || !end || !term) return null;
  const terms = [term];
  for (const option of durationOptionMonths(s.contractDuration)) terms.push(terms[terms.length - 1] + option);
  const gaps = terms.map((months) => {
    const expectedEnd = contractEndDate(start, months);
    return { expectedEnd, days: daysBetween(expectedEnd, end) };
  });
  if (gaps.some((g) => Math.abs(g.days) <= DATES_TOLERANCE_DAYS)) return null;
  return gaps[0];
}

/** Why the contract end date (and so the renewal countdown) is missing or unreadable. */
export const contractDateIssues = (s: Store): string[] => contractIssues(s).map((i) => i.text);

/** Every problem in a store's source data, with its kind. */
export function storeIssues(s: Store): Issue[] {
  const issues: Issue[] = [];
  if (!hasCoords(s))
    issues.push({ kind: "location", text: `${s.locationIssue || "No coordinates"}. Not shown on the map.` });
  if (s.rentSARAnnual === null) issues.push({ kind: "rent", text: "Annual rent is missing." });
  if (!s.size) issues.push({ kind: "area", text: "Area is missing." });
  issues.push(...contractIssues(s));
  const term = durationTerm(s.contractDuration).trim();
  if (isAmbiguousDuration(term))
    issues.push({
      kind: "durationAmbiguous",
      text: `Contract duration "${term}" could be 1 month or 10 months (Sheets drops trailing zeros). Write 10/11 months as text, e.g. '1y 10m'.`,
    });
  if (liveStatus(s) === null) {
    issues.push({
      kind: "liveStatus",
      text: s.live?.trim()
        ? `Live status "${s.live.trim()}" isn't recognised. Counted as Not Live.`
        : "Live status is blank. Counted as Not Live.",
    });
  }
  for (const e of s.sheetErrors ?? [])
    issues.push({ kind: "sheetError", text: `"${e.column}" is ${e.value} in the sheet, so it's read as empty.` });
  if (s.nextPayment && !parseDate(s.nextPayment))
    issues.push({ kind: "paymentUnreadable", text: `Next payment "${s.nextPayment}" isn't a recognised date.` });
  const total = totalMismatch(s);
  if (total) {
    const sar = (n: number) => `SAR ${Math.round(n).toLocaleString("en-US")}`;
    issues.push({
      kind: "totalMismatch",
      text: `Contract Total Value ${sar(s.contractTotal!)} is ${Math.abs(Math.round(total.diff * 100))}% ${total.diff > 0 ? "more" : "less"} than ${s.serviceFeesAnnual ? "(annual rent + service fees)" : "annual rent"} × term × 1.15 (${sar(total.expected)}).`,
    });
  }
  const dates = datesMismatch(s);
  if (dates) {
    issues.push({
      kind: "datesMismatch",
      text: `The start date plus ${monthsText(parseDurationMonths(s.contractDuration)!)} ends ${formatDate(dates.expectedEnd)}, but the end date is ${s.endDate} (${Math.abs(dates.days)} days ${dates.days > 0 ? "later" : "earlier"}).`,
    });
  }
  if (s.opd && s.opd > 0 && liveStatus(s) === false)
    issues.push({ kind: "opdNotLive", text: `OPD ${s.opd.toLocaleString("en-US")} on a store that isn't live.` });
  if (paidStatus(s) === null) {
    issues.push({
      kind: "paidStatus",
      text: s.paid?.trim()
        ? `Payment status "${s.paid.trim()}" isn't recognised. Counted as Unpaid.`
        : "Payment status is blank. Counted as Unpaid.",
    });
  }
  return issues;
}

/** Problems in a store's source data, shown so they can be fixed in the sheet or file. */
export function dataIssues(s: Store, include: { location?: boolean; status?: boolean } = {}): string[] {
  const { location = true, status = true } = include;
  return storeIssues(s)
    .filter(
      (i) => (location || i.kind !== "location") && (status || (i.kind !== "liveStatus" && i.kind !== "paidStatus")),
    )
    .map((i) => i.text);
}

// ── The Data Quality panel ──

/** A group in the panel: what's wrong, how to fix it, and the stores it applies to. */
export interface IssueGroup {
  kind: IssueKind | "duplicateCode";
  title: string;
  fix: string;
  items: Array<{ store: Store; detail: string }>;
}

const GROUPS: Record<IssueKind | "duplicateCode", { title: string; fix: string }> = {
  location: { title: "No location on the map", fix: "Add or correct the Lat and Lng columns." },
  liveStatus: { title: "Live status blank or not recognised", fix: 'Use "Live" / "Not Live" (or Yes / No).' },
  paidStatus: { title: "Payment status blank or not recognised", fix: 'Use "Paid" / "Not Paid" (or Yes / No).' },
  startMissing: { title: "Contract start date missing", fix: "Fill in the Contract Start Date column." },
  startUnreadable: {
    title: "Contract start date not recognised",
    fix: "Write dates like 01/02/2025, 1 Feb 2025 or, in Hijri, 1446/08/02 هـ.",
  },
  endUnreadable: {
    title: "Contract end date not recognised",
    fix: "Write dates like 31/01/2027, 31 Jan 2027 or, in Hijri, 1448/08/23 هـ.",
  },
  durationMissing: {
    title: "Contract duration missing",
    fix: "Fill in Contract Duration (such as 2 or 2 Years) or the end date.",
  },
  durationUnknown: {
    title: "Contract duration not recognised",
    fix: "A bare number is years.months: 2 = 2 years, 1.6 = 1 year 6 months, 0.6 = 6 months (the months part goes up to 11). Or write 18 Months or 1y 10m, or fill in the end date.",
  },
  durationAmbiguous: {
    title: "Contract duration could be 1 or 10 months",
    fix: "Google Sheets turns 0.10 into 0.1. Write 10 or 11 months as text, such as 1y 10m or 22 months.",
  },
  rent: { title: "Annual rent missing", fix: "Fill in the Annual Rent column." },
  area: { title: "Area missing", fix: "Fill in the Area (sqm.) column." },
  duplicateCode: { title: "Same DS code on more than one store", fix: "Give each store its own DS code." },
  sheetError: {
    title: "Spreadsheet errors (#N/A, #REF!…)",
    fix: "A lookup or formula found nothing. Fix it in the sheet; meanwhile the cell is read as empty (a missing end date is worked out from the start date and duration).",
  },
  paymentUnreadable: {
    title: "Next payment date not recognised",
    fix: "Write dates like 01/02/2026 or 1 Feb 2026.",
  },
  totalMismatch: {
    title: "Contract Total Value doesn't match the rent",
    fix: "Contract Total Value includes 15% VAT: it should be about (annual rent + service fees) × term in years × 1.15. Check the rent, the service fees, the duration or the register.",
  },
  opdMissing: {
    title: "Live store with no OPD",
    fix: "Fill in the OPD (orders per day) column, so the store's cost per order can be worked out.",
  },
  opdNotLive: {
    title: "OPD on a store that isn't live",
    fix: "A store that isn't live shouldn't have orders. Check its Live status or its OPD.",
  },
  datesMismatch: {
    title: "Contract dates don't match the duration",
    fix: "The end date should be the start date plus the contract duration. Check the dates or the duration.",
  },
};

// Groups in the order they're shown: what hides a store or skews the totals first
const ORDER: Array<IssueKind | "duplicateCode"> = [
  "location",
  "liveStatus",
  "paidStatus",
  "startMissing",
  "startUnreadable",
  "endUnreadable",
  "durationMissing",
  "durationUnknown",
  "durationAmbiguous",
  "rent",
  "area",
  "sheetError",
  "paymentUnreadable",
  "totalMismatch",
  "datesMismatch",
  "opdMissing",
  "opdNotLive",
  "duplicateCode",
];

/** Every store's problems, grouped by kind (only groups with stores in them), and how many stores have any. */
export function dataQuality(stores: Store[]): { groups: IssueGroup[]; storesWithIssues: number } {
  const byKind = new Map<IssueGroup["kind"], IssueGroup["items"]>();
  const add = (kind: IssueGroup["kind"], store: Store, detail: string) => {
    const list = byKind.get(kind) ?? [];
    list.push({ store, detail });
    byKind.set(kind, list);
  };
  const flagged = new Set<number>();
  for (const s of stores) {
    for (const issue of storeIssues(s)) {
      add(issue.kind, s, issue.text);
      flagged.add(s.id);
    }
  }
  // Live stores without an OPD, once the data has an OPD column at all (else every store would be listed)
  if (stores.some((s) => s.opd && s.opd > 0))
    for (const s of stores) {
      if (liveStatus(s) !== true || (s.opd && s.opd > 0)) continue;
      add("opdMissing", s, "Live, but no OPD, so there's no cost per order.");
      flagged.add(s.id);
    }
  const byCode = new Map<string, Store[]>();
  for (const s of stores) {
    const code = s.dsCode.trim().toUpperCase();
    if (code) byCode.set(code, [...(byCode.get(code) ?? []), s]);
  }
  for (const [code, same] of byCode) {
    if (same.length < 2) continue;
    for (const s of same) {
      add(
        "duplicateCode",
        s,
        `${code} is also used by ${same.length - 1} other ${same.length === 2 ? "store" : "stores"}.`,
      );
      flagged.add(s.id);
    }
  }
  const groups = ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
    kind,
    ...GROUPS[kind],
    items: byKind.get(kind)!,
  }));
  return { groups, storesWithIssues: flagged.size };
}
