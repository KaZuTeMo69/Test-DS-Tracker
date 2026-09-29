import { Store } from "../types";
import { parseDate, parseDurationMonths } from "./contract";
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
  | "liveStatus"
  | "paidStatus";

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
  } else if (startOk) {
    issues.push(
      s.contractDuration.trim() && !parseDurationMonths(s.contractDuration)
        ? {
            kind: "durationUnknown",
            text: `Contract duration "${s.contractDuration.trim()}" isn't recognised, so the end date can't be worked out.`,
          }
        : { kind: "durationMissing", text: "Contract duration is missing, so the end date can't be worked out." },
    );
  }
  return issues;
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
  if (liveStatus(s) === null) {
    issues.push({
      kind: "liveStatus",
      text: s.live?.trim()
        ? `Live status "${s.live.trim()}" isn't recognised. Counted as Not Live.`
        : "Live status is blank. Counted as Not Live.",
    });
  }
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
    fix: "Write durations like 2, 2 Years or 18 Months, or fill in the end date.",
  },
  rent: { title: "Annual rent missing", fix: "Fill in the Annual Rent column." },
  area: { title: "Area missing", fix: "Fill in the Area (sqm.) column." },
  duplicateCode: { title: "Same DS code on more than one store", fix: "Give each store its own DS code." },
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
  "rent",
  "area",
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
