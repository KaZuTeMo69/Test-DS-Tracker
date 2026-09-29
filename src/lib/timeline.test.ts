import { describe, expect, it } from "vitest";
import { Store } from "../types";
import { renewalTimeline } from "./timeline";

const store = (id: number, endDate: string, startDate = ""): Store => ({
  id,
  name: `S${id}`,
  dsCode: "",
  city: "Riyadh",
  country: "KSA",
  contractDuration: "",
  startDate,
  endDate,
  size: null,
  rentSARAnnual: null,
  rentSARMonthly: null,
  rentSARsqm: null,
  lat: null,
  lng: null,
});

const days = { leadDays: 75, warningDays: 30 };
const today = new Date(Date.UTC(2026, 8, 28)); // 28 Sep 2026

describe("renewalTimeline", () => {
  const t = renewalTimeline(
    [
      store(1, "31/12/2026", "01/01/2024"), // renewal from 17 Oct 2026: soon
      store(2, "15/11/2026"), // renewal from 1 Sep 2026: now
      store(3, "14/08/2026"), // ended
      store(4, "01/12/2027"), // renewal from 17 Sep 2027: after the chart
      store(5, "15/10/2027"), // renewal from 1 Aug 2027: in the chart, ends after it
      store(6, ""), // no end date
      store(7, "01/09/2026"), // ended, more recently than 3
    ],
    days,
    today,
  );

  it("covers the 12 months from the start of this month", () => {
    expect(t.start.toISOString().slice(0, 10)).toBe("2026-09-01");
    expect(t.end.toISOString().slice(0, 10)).toBe("2027-09-01");
    expect(t.months.map((m) => m.label).join(" ")).toBe("Sep Oct Nov Dec Jan Feb Mar Apr May Jun Jul Aug");
    expect(t.months.filter((m) => m.year).map((m) => m.year)).toEqual([2026, 2027]);
    expect(t.months[0].at).toBe(0);
    expect(t.todayAt).toBeCloseTo((27 / 365) * 100, 5);
  });

  it("lists renewals in the order they start, leaving out later ones", () => {
    expect(t.rows.map((r) => r.store.id)).toEqual([2, 1, 5]);
    expect(t.rows.map((r) => r.info.status)).toEqual(["now", "soon", "ok"]);
  });

  it("places the contract, renewal window and end on the chart", () => {
    const [now, soon, later] = t.rows;
    expect(soon.contractFrom).toBe(0); // started before the chart
    expect(soon.renewalFrom).toBeCloseTo((46 / 365) * 100, 5); // 17 Oct
    expect(soon.endAt).toBeCloseTo((121 / 365) * 100, 5); // 31 Dec
    expect(now.renewalFrom).toBe(0); // 1 Sep, the first day shown
    expect(later.endsLater).toBe(true);
    expect(later.endAt).toBe(100);
  });

  it("lists ended contracts separately, most recent first, and counts those without an end date", () => {
    expect(t.expired.map((e) => e.store.id)).toEqual([7, 3]);
    expect(t.noEndDate).toBe(1);
  });

  it("follows the lead days from Settings", () => {
    const longer = renewalTimeline([store(4, "01/12/2027")], { leadDays: 120, warningDays: 30 }, today);
    expect(longer.rows.map((r) => r.store.id)).toEqual([4]); // renewal from 3 Aug 2027
  });
});
