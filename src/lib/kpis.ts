import { Store } from "../types";
import { RenewalDays } from "./contract";
import { paymentInfo } from "./payments";
import { NetworkFigures, networkFigures } from "./cpo";
import { storeRenewal } from "./renewal";
import { rentFactor } from "./settings";
import { isLive, isPaid } from "./status";

/** The totals shown in the top bar, its popover and the City tab, for the stores that pass the filters. */
export interface KpiStats {
  total: number;
  live: number;
  paid: number;
  totalRent: number; // SAR a year, with VAT when Settings say so
  totalArea: number;
  noRent: number; // stores left out of the rent totals
  noArea: number;
  renewals: { now: number; soon: number; expired: number };
  payments: { due: number; overdue: number }; // next payments due within 30 days, and past due
  network: NetworkFigures; // total OPD, and the CPO weighted by orders
  avgRent: number; // rent per m², over the stores with both rent and area
}

export function kpiStats(stores: Store[], days: RenewalDays, includeVat: boolean): KpiStats {
  const factor = rentFactor(includeVat);
  const s: KpiStats = {
    total: stores.length,
    live: 0,
    paid: 0,
    totalRent: 0,
    totalArea: 0,
    noRent: 0,
    noArea: 0,
    renewals: { now: 0, soon: 0, expired: 0 },
    payments: { due: 0, overdue: 0 },
    network: networkFigures(stores),
    avgRent: 0,
  };
  let pricedRent = 0;
  let pricedArea = 0;
  for (const store of stores) {
    if (isLive(store)) s.live++;
    if (isPaid(store)) s.paid++;
    const rent = store.rentSARAnnual === null ? null : store.rentSARAnnual * factor;
    if (rent === null) s.noRent++;
    s.totalRent += rent || 0;
    if (!store.size) s.noArea++;
    s.totalArea += store.size || 0;
    if (rent !== null && store.size) {
      pricedRent += rent;
      pricedArea += store.size;
    }
    const { status } = storeRenewal(store, days);
    if (status === "now" || status === "soon" || status === "expired") s.renewals[status]++;
    const payment = paymentInfo(store).status;
    if (payment === "due" || payment === "overdue") s.payments[payment]++;
  }
  s.avgRent = pricedArea > 0 ? pricedRent / pricedArea : 0;
  return s;
}

/** Totals leave out stores with no value, so say how many were left out. */
export const missing = (n: number, what: string) => (n > 0 ? `${n} without ${what}` : undefined);
