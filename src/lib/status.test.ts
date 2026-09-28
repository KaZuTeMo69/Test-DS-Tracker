import { describe, expect, it } from "vitest";
import { Store } from "../types";
import { hasUnclearStatus, isLive, isPaid, liveStatus, paidStatus } from "./status";

const store = (live?: string, paid?: string) => ({ live, paid }) as Store;

describe("liveStatus", () => {
  it.each(["Yes", "yes", "Y", "Live", "LIVE", "live now", "Live - since Jan 2024", "Active", "Open", "1", "true"])(
    "%j is live",
    (value) => {
      expect(liveStatus(store(value))).toBe(true);
    },
  );

  it.each(["No", "N", "Not Live", "not yet", "Under construction", "Pending", "Coming soon", "Closed", "0", "false"])(
    "%j is not live",
    (value) => {
      expect(liveStatus(store(value))).toBe(false);
    },
  );

  it.each([undefined, "", "   ", "Maybe", "?", "TBC", "-"])("%j is unclear", (value) => {
    expect(liveStatus(store(value))).toBeNull();
  });

  it("reads only the first word", () => {
    expect(liveStatus(store("Live, but the landlord says not"))).toBe(true);
    expect(liveStatus(store("Not live yet"))).toBe(false);
  });
});

describe("paidStatus", () => {
  it.each(["Paid", "paid", "PAID", "Paid Jun 2024", "Yes", "1", "true"])("%j is paid", (value) => {
    expect(paidStatus(store(undefined, value))).toBe(true);
  });

  it.each(["Unpaid", "Not Paid", "No", "Overdue", "Due", "Partially paid", "Partial", "Pending", "Outstanding"])(
    "%j is unpaid",
    (value) => {
      expect(paidStatus(store(undefined, value))).toBe(false);
    },
  );

  it.each([undefined, "", "Maybe", "TBD", "Invoice sent"])("%j is unclear", (value) => {
    expect(paidStatus(store(undefined, value))).toBeNull();
  });
});

describe("isLive / isPaid", () => {
  it("count unclear values as not live / unpaid", () => {
    expect(isLive(store("Maybe"))).toBe(false);
    expect(isLive(store(""))).toBe(false);
    expect(isPaid(store(undefined, "TBD"))).toBe(false);
    expect(isLive(store("Live"))).toBe(true);
    expect(isPaid(store(undefined, "Paid"))).toBe(true);
  });
});

describe("hasUnclearStatus", () => {
  it("is true when either status is blank or not recognised", () => {
    expect(hasUnclearStatus(store("Live", "Paid"))).toBe(false);
    expect(hasUnclearStatus(store("Not Live", "Unpaid"))).toBe(false);
    expect(hasUnclearStatus(store("Maybe", "Paid"))).toBe(true);
    expect(hasUnclearStatus(store("Live", ""))).toBe(true);
    expect(hasUnclearStatus(store(undefined, undefined))).toBe(true);
  });
});
