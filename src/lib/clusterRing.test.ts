import { describe, expect, it } from "vitest";
import { clusterDiameter, clusterSvg, clusterWords, RingPart, ringSegments } from "./clusterRing";

const part = (
  key: string,
  order: number,
  count: number,
  label = key,
  color = `#${order}${order}${order}`,
): RingPart => ({
  key,
  order,
  count,
  label,
  color,
});

describe("a cluster's ring", () => {
  it("splits the ring by count, with a gap between parts, clockwise from the top", () => {
    const C = 100;
    const segs = ringSegments([part("a", 0, 2), part("b", 1, 1), part("c", 2, 1)], C, 2, 0);
    const room = C - 3 * 2;
    expect(segs.map((s) => s.length)).toEqual([room / 2, room / 4, room / 4]);
    expect(segs[0].start).toBe(1);
    expect(segs[1].start).toBeCloseTo(1 + room / 2 + 2);
    // The last arc ends half a gap before the top again
    const last = segs[2];
    expect(last.start + last.length).toBeCloseTo(C - 1);
  });

  it("one category is the whole ring; empty ones are left out", () => {
    expect(ringSegments([part("a", 0, 5), part("b", 1, 0)], 80)).toEqual([{ color: "#000", start: 0, length: 80 }]);
    expect(ringSegments([], 80)).toEqual([]);
  });

  it("a part of one store in hundreds still shows", () => {
    const segs = ringSegments([part("a", 0, 499), part("b", 1, 1)], 120, 2, 3);
    expect(segs[1].length).toBe(3);
    expect(segs[0].length + segs[1].length + 4).toBeCloseTo(120);
  });

  it("grows gently with the count", () => {
    expect([2, 10, 100, 1000, 100000].map(clusterDiameter)).toEqual([30, 35, 42, 49, 52]);
  });
});

describe("a cluster in words", () => {
  it("says the breakdown in the legend's order", () => {
    const parts = [
      part("rent:high", 2, 1, "over 25% above"),
      part("rent:below", 0, 2, "at or below median"),
      part("rent:above", 1, 1, "up to 25% above"),
    ];
    expect(clusterWords(parts)).toBe("4 stores: 2 at or below median, 1 up to 25% above, 1 over 25% above");
    expect(clusterWords([part("status:round", 0, 1200, "live and paid")])).toBe("1,200 stores: 1,200 live and paid");
  });

  it("the icon: a dark disc with the count in white, a ring arc per category, and the words for screen readers", () => {
    const { html, size } = clusterSvg([
      part("a", 0, 3, "live and paid", "#4ade80"),
      part("b", 1, 1, "not live", "#f87171"),
    ]);
    expect(size).toBe(clusterDiameter(4));
    expect(html).toContain('fill="#141414"');
    expect(html).toContain('stroke="#333333"');
    expect(html).toMatch(/fill="#ffffff"[^>]*>4<\/text>/);
    expect((html.match(/stroke-dasharray/g) || []).length).toBe(2);
    expect(html).toContain('stroke="#4ade80"');
    expect(html).toContain('aria-label="4 stores: 3 live and paid, 1 not live"');
    expect(clusterSvg([part("a", 0, 1500)]).html).toMatch(/>1\.5K<\/text>/);
  });
});
