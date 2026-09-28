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
