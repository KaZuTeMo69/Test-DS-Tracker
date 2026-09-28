import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { CitySummary, LiveFilter, PaidFilter, RenewalFilter, Store } from "../types";
import { storeRenewal } from "../lib/renewal";
import { hasUnclearStatus, isLive, isPaid, liveStatus, paidStatus } from "../lib/status";

/** The search box, Live / Paid / Renewal filters and "unclear status only" (the city filter is applied separately). */
function matchesFilters(
  s: Store,
  query: string,
  live: LiveFilter,
  paid: PaidFilter,
  renewal: RenewalFilter,
  unclearOnly: boolean,
): boolean {
  const q = query.toLowerCase();
  const matchesQuery =
    !query ||
    s.name.toLowerCase().includes(q) ||
    (s.city && s.city.toLowerCase().includes(q)) ||
    (s.dsCode && s.dsCode.toLowerCase().includes(q));
  const matchesLive = live === "all" || (live === "live" && isLive(s)) || (live === "notlive" && !isLive(s));
  const matchesPaid = paid === "all" || (paid === "paid" && isPaid(s)) || (paid === "notpaid" && !isPaid(s));
  const status = renewal === "all" ? null : storeRenewal(s).status;
  const matchesRenewal =
    renewal === "all" ||
    (renewal === "renew" && (status === "now" || status === "soon")) ||
    (renewal === "expired" && status === "expired");
  const matchesUnclear = !unclearOnly || hasUnclearStatus(s);
  return Boolean(matchesQuery && matchesLive && matchesPaid && matchesRenewal && matchesUnclear);
}

/** The sidebar filters, with setters, as one object for the components that show them. */
export interface Filters {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  liveFilter: LiveFilter;
  setLiveFilter: (f: LiveFilter) => void;
  paidFilter: PaidFilter;
  setPaidFilter: (f: PaidFilter) => void;
  renewalFilter: RenewalFilter;
  setRenewalFilter: (f: RenewalFilter) => void;
  cityFilter: string;
  setCityFilter: (c: string) => void;
  unclearOnly: boolean;
  setUnclearOnly: (on: boolean) => void;
}

/** Filter state, and the stores and city totals that pass the filters. */
export function useFilters(stores: Store[]) {
  const [searchQuery, setSearchQuery] = useState("");
  const [liveFilter, setLiveFilter] = useState<LiveFilter>("all");
  const [paidFilter, setPaidFilter] = useState<PaidFilter>("all");
  const [renewalFilter, setRenewalFilter] = useState<RenewalFilter>("all");
  const [cityFilter, setCityFilter] = useState("");
  const [unclearOnly, setUnclearOnly] = useState(false);

  // The search box updates as you type; the list follows a moment later, so typing stays smooth with many stores
  const query = useDeferredValue(searchQuery);

  const filteredStores = useMemo(() => {
    return stores
      .filter((s) => {
        const matchesCity = !cityFilter || s.city === cityFilter;
        return matchesFilters(s, query, liveFilter, paidFilter, renewalFilter, unclearOnly) && matchesCity;
      })
      .sort((a, b) => {
        // With a renewal filter on, the contract ending soonest comes first; otherwise highest rent first
        if (renewalFilter !== "all") {
          return (storeRenewal(a).daysToEnd ?? Infinity) - (storeRenewal(b).daysToEnd ?? Infinity);
        }
        const ra = a.rentSARAnnual;
        const rb = b.rentSARAnnual;
        return (rb || 0) - (ra || 0);
      });
  }, [stores, query, liveFilter, paidFilter, renewalFilter, cityFilter, unclearOnly]);

  const citySummaries = useMemo(() => {
    const map = new Map<string, CitySummary>();

    stores
      .filter((s) => matchesFilters(s, query, liveFilter, paidFilter, renewalFilter, unclearOnly))
      .forEach((s) => {
        const city = s.city || "Unknown";
        if (!map.has(city)) {
          map.set(city, { city, count: 0, live: 0, paid: 0, annualRent: 0, area: 0 });
        }
        const c = map.get(city)!;
        c.count++;
        if (isLive(s)) c.live++;
        if (isPaid(s)) c.paid++;
        c.annualRent += s.rentSARAnnual || 0;
        c.area += s.size || 0;
      });
    return Array.from(map.values()).sort((a, b) => b.annualRent - a.annualRent);
  }, [stores, query, liveFilter, paidFilter, renewalFilter, unclearOnly]);

  const allCities = useMemo(() => Array.from(new Set(stores.map((s) => s.city).filter(Boolean))).sort(), [stores]);

  // Stores whose Live or Payment status is blank or not recognised (counted as Not Live / Unpaid), across all stores
  const unclear = useMemo(() => {
    let live = 0;
    let paid = 0;
    let total = 0;
    stores.forEach((s) => {
      const liveUnclear = liveStatus(s) === null;
      const paidUnclear = paidStatus(s) === null;
      if (liveUnclear) live++;
      if (paidUnclear) paid++;
      if (liveUnclear || paidUnclear) total++;
    });
    return { total, live, paid };
  }, [stores]);

  // Shows only the stores with an unclear status. The other filters are cleared so the list shows exactly
  // the stores the warning counted
  const showUnclearOnly = useCallback(() => {
    setSearchQuery("");
    setLiveFilter("all");
    setPaidFilter("all");
    setRenewalFilter("all");
    setCityFilter("");
    setUnclearOnly(true);
  }, []);

  const filters: Filters = useMemo(
    () => ({
      searchQuery,
      setSearchQuery,
      liveFilter,
      setLiveFilter,
      paidFilter,
      setPaidFilter,
      renewalFilter,
      setRenewalFilter,
      cityFilter,
      setCityFilter,
      unclearOnly,
      setUnclearOnly,
    }),
    [searchQuery, liveFilter, paidFilter, renewalFilter, cityFilter, unclearOnly],
  );

  return { filters, filteredStores, citySummaries, allCities, unclear, showUnclearOnly };
}
