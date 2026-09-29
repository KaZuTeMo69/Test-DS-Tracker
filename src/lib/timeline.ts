import { Store } from "../types";
import { parseDate, RenewalDays, RenewalInfo, renewalInfo } from "./contract";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const TIMELINE_MONTHS = 12;

/** A month column: where it starts across the chart (0–100), its short name, and the year on the first and on January. */
export interface TimelineMonth {
  at: number;
  label: string;
  year: number | null;
}

/** A store's row. Positions are percentages across the chart; the bar is cut at the right edge past the last month. */
export interface TimelineRow {
  store: Store;
  info: RenewalInfo;
  contractFrom: number; // where the contract line starts: the chart's left edge, or the contract start if later
  renewalFrom: number;
  endAt: number;
  endsLater: boolean; // the contract ends after the last month shown
}

export interface Timeline {
  start: Date;
  end: Date;
  months: TimelineMonth[];
  todayAt: number;
  rows: TimelineRow[]; // renewals starting before the end of the chart, in the order they start
  expired: Array<{ store: Store; info: RenewalInfo }>; // most recently ended first
  noEndDate: number;
}

/**
 * The 12 months from the start of this month: every contract whose renewal starts in that time (including
 * renewals already due), with the contract, its renewal window and its end date placed on the chart.
 */
export function renewalTimeline(stores: Store[], days: RenewalDays, today: Date): Timeline {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + TIMELINE_MONTHS, 1));
  const span = end.getTime() - start.getTime();
  const at = (d: Date) => Math.min(100, Math.max(0, ((d.getTime() - start.getTime()) / span) * 100));

  const months: TimelineMonth[] = Array.from({ length: TIMELINE_MONTHS }, (_, i) => {
    const d = new Date(Date.UTC(year, month + i, 1));
    return {
      at: at(d),
      label: MONTHS[d.getUTCMonth()],
      year: i === 0 || d.getUTCMonth() === 0 ? d.getUTCFullYear() : null,
    };
  });

  const rows: TimelineRow[] = [];
  const expired: Timeline["expired"] = [];
  let noEndDate = 0;
  for (const store of stores) {
    const info = renewalInfo(store, today, days);
    if (!info.endDate || !info.renewalStart) {
      noEndDate++;
    } else if (info.status === "expired") {
      expired.push({ store, info });
    } else if (info.renewalStart < end) {
      const contractStart = store.startDate ? parseDate(store.startDate) : null;
      rows.push({
        store,
        info,
        contractFrom: contractStart ? at(contractStart) : 0,
        renewalFrom: at(info.renewalStart),
        endAt: at(info.endDate),
        endsLater: info.endDate >= end,
      });
    }
  }
  rows.sort(
    (a, b) =>
      a.info.renewalStart!.getTime() - b.info.renewalStart!.getTime() ||
      a.info.endDate!.getTime() - b.info.endDate!.getTime(),
  );
  expired.sort((a, b) => b.info.endDate!.getTime() - a.info.endDate!.getTime());
  return { start, end, months, todayAt: at(today), rows, expired, noEndDate };
}
