import { Store } from "../types";
import { RenewalInfo, renewalInfo, today } from "./contract";

// Filters, sorting, totals and list tags all ask for a store's renewal status on every screen update, so it's
// worked out once per store per day. A store object is replaced whenever the data loads again, so the cache
// never returns results for old data
const cache = new WeakMap<Store, { day: number; info: RenewalInfo }>();

export function storeRenewal(s: Store): RenewalInfo {
  const now = today();
  const hit = cache.get(s);
  if (hit && hit.day === now.getTime()) return hit.info;
  const info = renewalInfo(s, now);
  cache.set(s, { day: now.getTime(), info });
  return info;
}
