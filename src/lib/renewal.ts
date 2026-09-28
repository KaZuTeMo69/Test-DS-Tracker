import { Store } from "../types";
import { RenewalDays, RenewalInfo, renewalInfo, today } from "./contract";

// Filters, sorting, totals and list tags all ask for a store's renewal status on every screen update, so it's
// worked out once per store per day and per renewal setting. A store object is replaced whenever the data
// loads again, so the cache never returns results for old data
const cache = new WeakMap<Store, { key: string; info: RenewalInfo }>();

export function storeRenewal(s: Store, days: RenewalDays): RenewalInfo {
  const now = today();
  const key = `${now.getTime()}|${days.leadDays}|${days.warningDays}`;
  const hit = cache.get(s);
  if (hit && hit.key === key) return hit.info;
  const info = renewalInfo(s, now, days);
  cache.set(s, { key, info });
  return info;
}
