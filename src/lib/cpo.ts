import { Store } from "../types";
import { CityMedian, compareToMedian, RentBenchmark } from "./rentStats";

/**
 * CPO, the rent cost per order: annual rent / 12 / 30 / OPD. Our team's 360-day convention: a year of 12 months
 * of 30 days, not 365. The annual rent is the annualised one for contracts under 12 months. Null without a rent,
 * or when OPD is missing or 0.
 */
export function costPerOrder(annualRent: number | null, opd: number | null | undefined): number | null {
  if (annualRent === null || !opd || opd <= 0) return null;
  return annualRent / 12 / 30 / opd;
}

/** A store's CPO (SAR per order, without VAT like the rent it comes from). */
export const storeCpo = (s: Store) => costPerOrder(s.rentSARAnnual, s.opd);

export interface NetworkFigures {
  opd: number; // total orders per day, over the stores with an OPD
  withOpd: number; // stores with an OPD
  cpo: number | null; // weighted: total annual rent / 360 / total OPD, over the stores with both
  included: number; // stores in that CPO (an OPD and a rent)
  simpleCpo: number | null; // the plain average of the stores' CPOs, for comparison
}

/**
 * The network's OPD, and its CPO weighted by orders: all the rent over all the orders, so a busy store counts for
 * more than a quiet one (the plain average of CPOs would count them the same). Stores without an OPD, or with an
 * OPD but no rent, are left out of the CPO.
 */
export function networkFigures(stores: Store[]): NetworkFigures {
  let opd = 0;
  let withOpd = 0;
  let rent = 0;
  let pricedOpd = 0;
  const cpos: number[] = [];
  for (const s of stores) {
    if (!s.opd || s.opd <= 0) continue;
    opd += s.opd;
    withOpd++;
    const cpo = storeCpo(s);
    if (cpo === null) continue;
    rent += s.rentSARAnnual!;
    pricedOpd += s.opd;
    cpos.push(cpo);
  }
  return {
    opd,
    withOpd,
    cpo: pricedOpd > 0 ? rent / 12 / 30 / pricedOpd : null,
    included: cpos.length,
    simpleCpo: cpos.length ? cpos.reduce((a, b) => a + b, 0) / cpos.length : null,
  };
}

// ── Pin colours ──

/** OPD by quartile of the stores with one: q1 the quietest quarter, q4 the busiest. */
export type OpdLevel = "q1" | "q2" | "q3" | "q4" | "none";

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Each store's OPD quartile (none without an OPD). The cut points are the 25th, 50th and 75th percentiles. */
export function opdLevels(stores: Store[]): Map<number, OpdLevel> {
  const values = stores.map((s) => s.opd).filter((v): v is number => !!v && v > 0);
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => {
    // Linear interpolation between the closest ranks
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
  };
  const [q1, q2, q3] = sorted.length ? [at(0.25), at(0.5), at(0.75)] : [0, 0, 0];
  return new Map(
    stores.map((s) => {
      const v = s.opd;
      if (!v || v <= 0 || !sorted.length) return [s.id, "none"];
      return [s.id, v <= q1 ? "q1" : v <= q2 ? "q2" : v <= q3 ? "q3" : "q4"];
    }),
  );
}

/** Each city's median CPO, over the stores with one (keyed by the city in lower case). */
export function cityCpoMedians(stores: Store[]): Map<string, CityMedian> {
  const byCity = new Map<string, number[]>();
  for (const s of stores) {
    const cpo = storeCpo(s);
    if (cpo === null) continue;
    const key = s.city.trim().toLowerCase();
    byCity.set(key, [...(byCity.get(key) ?? []), cpo]);
  }
  return new Map([...byCity].map(([city, list]) => [city, { median: median(list), count: list.length }]));
}

/** Each store's CPO against its city's median: the same bands (and flag %) as rent per m². */
export function cpoBenchmarks(stores: Store[], flagPercent: number): Map<number, RentBenchmark> {
  const medians = cityCpoMedians(stores);
  return new Map(
    stores.map((s) => [s.id, compareToMedian(storeCpo(s), medians.get(s.city.trim().toLowerCase()), flagPercent)]),
  );
}

// ── OPD against CPO ──

export type Quadrant = "split" | "review" | "strong" | "grow";

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  split: "Split candidates", // high OPD, high CPO
  review: "Review / relocate", // low OPD, high CPO
  strong: "Strong", // high OPD, low CPO
  grow: "Room to grow", // low OPD, low CPO
};

/** Where a store falls against the medians: high means above the median (at the median counts as low). */
export function quadrant(opd: number, cpo: number, medianOpd: number, medianCpo: number): Quadrant {
  const busy = opd > medianOpd;
  const costly = cpo > medianCpo;
  return busy ? (costly ? "split" : "strong") : costly ? "review" : "grow";
}

export interface ScatterPoint {
  store: Store;
  opd: number;
  cpo: number;
  quadrant: Quadrant;
}

/** The stores with both an OPD and a CPO, the medians of the two, and each store's quadrant. */
export function opdCpoScatter(stores: Store[]): { points: ScatterPoint[]; medianOpd: number; medianCpo: number } {
  const both = stores
    .map((store) => ({ store, opd: store.opd ?? 0, cpo: storeCpo(store) }))
    .filter((p): p is { store: Store; opd: number; cpo: number } => p.opd > 0 && p.cpo !== null);
  if (!both.length) return { points: [], medianOpd: 0, medianCpo: 0 };
  const medianOpd = median(both.map((p) => p.opd));
  const medianCpo = median(both.map((p) => p.cpo));
  return {
    points: both.map((p) => ({ ...p, quadrant: quadrant(p.opd, p.cpo, medianOpd, medianCpo) })),
    medianOpd,
    medianCpo,
  };
}

// ── A Potential against the target CPO ──

export interface PotentialTargets {
  estimatedCpo: number | null; // asking rent / 360 / expected OPD
  minOpd: number | null; // the OPD needed to hit the target at the asking rent: asking rent / 360 / target
  maxRent: number | null; // the most rent a year that hits the target at the expected OPD: target × 360 × OPD
}

export function potentialTargets(
  askingRentAnnual: number | null,
  expectedOpd: number | null,
  targetCpo: number | null,
): PotentialTargets {
  const target = targetCpo && targetCpo > 0 ? targetCpo : null;
  return {
    estimatedCpo: costPerOrder(askingRentAnnual, expectedOpd),
    minOpd: askingRentAnnual !== null && askingRentAnnual > 0 && target ? askingRentAnnual / 360 / target : null,
    maxRent: target && expectedOpd && expectedOpd > 0 ? target * 360 * expectedOpd : null,
  };
}
