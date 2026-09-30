import { Store } from "../types";
import { daysBetween, parseDate, today } from "./contract";

// A payment due within this many days is flagged, as renewals are
export const PAYMENT_WARNING_DAYS = 30;

/** overdue: the next payment's date has passed · due: within PAYMENT_WARNING_DAYS · later · none: no date */
export type PaymentStatus = "overdue" | "due" | "later" | "none";

export interface PaymentInfo {
  status: PaymentStatus;
  date: Date | null;
  days: number | null; // until the payment, negative once it's overdue
}

// A contract the register marks as ended owes nothing more, whatever its Next Payment says
const ENDED = /terminat|cancel|closed|ended|expired|inactive/i;

/** The store's next payment (the contract register's "Next Payment") and whether it's due or overdue. */
export function paymentInfo(s: Store, on: Date = today()): PaymentInfo {
  const date = s.nextPayment ? parseDate(s.nextPayment) : null;
  if (!date || ENDED.test(s.contractStatus ?? "")) return { status: "none", date, days: null };
  const days = daysBetween(on, date);
  return { status: days < 0 ? "overdue" : days <= PAYMENT_WARNING_DAYS ? "due" : "later", date, days };
}

/** How many of the stores have a payment due within the warning window, and how many are overdue. */
export function paymentCounts(stores: Store[], on: Date = today()): { due: number; overdue: number } {
  const counts = { due: 0, overdue: 0 };
  for (const s of stores) {
    const { status } = paymentInfo(s, on);
    if (status === "due" || status === "overdue") counts[status]++;
  }
  return counts;
}

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  overdue: "Payment overdue",
  due: "Payment due",
  later: "Payment scheduled",
  none: "No next payment",
};
