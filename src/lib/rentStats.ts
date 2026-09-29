import { Store } from "../types";

export interface RentComparison {
  storeRate: number | null; // this store's rent per m² (SAR)
  cityRate: number | null; // average rent per m² of the stores in the same city
  cityRateCount: number; // stores in the city that have both rent and area
  portfolioRate: number | null; // average rent per m² of all stores
  vsCity: number | null; // % above (+) or below (-) the city average
  vsPortfolio: number | null; // % above (+) or below (-) the all-stores average
  cityRentRank: number | null; // 1 = highest annual rent in the city
  cityRentCount: number; // stores in the city that have an annual rent
  shareOfTotalRent: number | null; // % of the total annual rent of all stores
}

// Averages are total rent / total area, so a big store counts for more than a small one
function averageRate(stores: Store[]): number | null {
  const priced = stores.filter((s) => s.rentSARAnnual !== null && s.size);
  const area = priced.reduce((sum, s) => sum + s.size!, 0);
  return area > 0 ? priced.reduce((sum, s) => sum + s.rentSARAnnual!, 0) / area : null;
}

const percentDiff = (value: number | null, base: number | null) =>
  value !== null && base ? Math.round((value / base - 1) * 100) : null;

/** How a store's rent compares with its city and with all stores. */
export function rentComparison(store: Store, stores: Store[]): RentComparison {
  const inCity = stores.filter((s) => s.city.trim().toLowerCase() === store.city.trim().toLowerCase());
  const storeRate = store.rentSARsqm;
  const cityRate = averageRate(inCity);
  const portfolioRate = averageRate(stores);

  const cityRents = inCity.filter((s) => s.rentSARAnnual !== null).sort((a, b) => b.rentSARAnnual! - a.rentSARAnnual!);
  const rank = cityRents.findIndex((s) => s.id === store.id);
  const totalRent = stores.reduce((sum, s) => sum + (s.rentSARAnnual || 0), 0);

  return {
    storeRate,
    cityRate,
    cityRateCount: inCity.filter((s) => s.rentSARAnnual !== null && s.size).length,
    portfolioRate,
    vsCity: percentDiff(storeRate, cityRate),
    vsPortfolio: percentDiff(storeRate, portfolioRate),
    cityRentRank: rank === -1 ? null : rank + 1,
    cityRentCount: cityRents.length,
    shareOfTotalRent:
      store.rentSARAnnual !== null && totalRent > 0 ? Math.round((store.rentSARAnnual / totalRent) * 1000) / 10 : null,
  };
}

// ── Rent per m² against the city median ──

// A median needs a few stores to mean anything; with two, one of them is always "above"
export const MIN_BENCHMARK_STORES = 3;

/** below: at or under the city median · above: up to the flag % over it · high: more than that · none: no comparison */
export type RentLevel = "below" | "above" | "high" | "none";

export interface RentBenchmark {
  median: number | null; // the city's median rent per m²
  cityCount: number; // stores in the city with a rent per m²
  diff: number | null; // % above (+) or below (-) the median, rounded
  level: RentLevel;
}

/** How big a pin is drawn: by annual rent, the lowest, middle and highest third of the stores. */
export type PinSize = "s" | "m" | "l";

export interface RentBenchmarks {
  of: Map<number, RentBenchmark>; // store id → comparison
  sizeOf: Map<number, PinSize>; // store id → pin size; stores without an annual rent are small
}

const cityKey = (s: Store) => s.city.trim().toLowerCase();
const rateOf = (s: Store) => (s.rentSARsqm !== null && s.rentSARsqm > 0 ? s.rentSARsqm : null);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Each store's rent per m² against the median of its city, across all stores (live or not), and its pin size.
 * Stores in a city with fewer than MIN_BENCHMARK_STORES rates aren't compared.
 */
export function rentBenchmarks(stores: Store[], flagPercent: number): RentBenchmarks {
  const rates = new Map<string, number[]>();
  for (const s of stores) {
    const rate = rateOf(s);
    if (rate === null) continue;
    const list = rates.get(cityKey(s)) ?? [];
    list.push(rate);
    rates.set(cityKey(s), list);
  }
  const medians = new Map([...rates].map(([city, list]) => [city, { median: median(list), count: list.length }]));

  const of = new Map<number, RentBenchmark>();
  for (const s of stores) {
    const city = medians.get(cityKey(s));
    const rate = rateOf(s);
    const compared = city && city.count >= MIN_BENCHMARK_STORES ? city : null;
    const diff = compared && rate !== null ? Math.round((rate / compared.median - 1) * 100) : null;
    of.set(s.id, {
      median: compared?.median ?? null,
      cityCount: city?.count ?? 0,
      diff,
      level: diff === null ? "none" : diff > flagPercent ? "high" : diff > 0 ? "above" : "below",
    });
  }

  // Thirds by annual rent
  const rents = stores.map((s) => s.rentSARAnnual).filter((r): r is number => r !== null && r > 0);
  const sorted = [...rents].sort((a, b) => a - b);
  const cut = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
  const [low, high] = sorted.length ? [cut(1 / 3), cut(2 / 3)] : [0, 0];
  const sizeOf = new Map<number, PinSize>(
    stores.map((s) => {
      const r = s.rentSARAnnual;
      return [s.id, r === null || r <= 0 || !sorted.length ? "s" : r < low ? "s" : r < high ? "m" : "l"];
    }),
  );
  return { of, sizeOf };
}
