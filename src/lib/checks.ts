import { Store } from "../types";
import { parseDate, parseDurationMonths } from "./contract";
import { liveStatus, paidStatus } from "./status";

export const hasCoords = (s: Store) => s.lat !== null && s.lng !== null;

/** Why the contract end date (and so the renewal countdown) is missing or unreadable. */
export function contractDateIssues(s: Store): string[] {
  const issues: string[] = [];
  const startOk = !!s.startDate && !!parseDate(s.startDate);
  if (!s.startDate) issues.push("Contract start date is missing.");
  else if (!startOk) issues.push(`Contract start date "${s.startDate}" isn't a recognised date.`);

  if (s.endDate) {
    if (!parseDate(s.endDate)) issues.push(`Contract end date "${s.endDate}" isn't a recognised date.`);
  } else if (startOk) {
    issues.push(
      s.contractDuration.trim() && !parseDurationMonths(s.contractDuration)
        ? `Contract duration "${s.contractDuration.trim()}" isn't recognised, so the end date can't be worked out.`
        : "Contract duration is missing, so the end date can't be worked out.",
    );
  }
  return issues;
}

/** Problems in a store's source data, shown so they can be fixed in the sheet or file. */
export function dataIssues(s: Store, include: { location?: boolean; status?: boolean } = {}): string[] {
  const { location = true, status = true } = include;
  const issues: string[] = [];
  if (location && !hasCoords(s)) {
    issues.push(`${s.locationIssue || "No coordinates"}. Not shown on the map.`);
  }
  if (s.rentSARAnnual === null) issues.push("Annual rent is missing.");
  if (!s.size) issues.push("Area is missing.");
  issues.push(...contractDateIssues(s));
  if (status && liveStatus(s) === null) {
    issues.push(
      s.live?.trim()
        ? `Live status "${s.live.trim()}" isn't recognised. Counted as Not Live.`
        : "Live status is blank. Counted as Not Live.",
    );
  }
  if (status && paidStatus(s) === null) {
    issues.push(
      s.paid?.trim()
        ? `Payment status "${s.paid.trim()}" isn't recognised. Counted as Unpaid.`
        : "Payment status is blank. Counted as Unpaid.",
    );
  }
  return issues;
}
