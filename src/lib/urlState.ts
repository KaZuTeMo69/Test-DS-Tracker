import { CoverageFilter, LiveFilter, PaidFilter, RenewalFilter, SidebarTab } from "../types";

// What a link to the app can carry: the view, never the data. The Google Sheet ID stays in this browser only,
// so someone opening a shared link sees the same view of their own stores (or the sample stores).

/** A special list: only stores with an unclear status, or only those the coverage checks flag. */
export type OnlyFilter = "unclear" | CoverageFilter;

export interface UrlState {
  tab: SidebarTab;
  q: string;
  live: LiveFilter;
  paid: PaidFilter;
  renewal: RenewalFilter;
  city: string;
  only: OnlyFilter | null;
  store: string | null; // the selected store's DS code
}

export const DEFAULT_URL_STATE: UrlState = {
  tab: "stores",
  q: "",
  live: "all",
  paid: "all",
  renewal: "all",
  city: "",
  only: null,
  store: null,
};

const TABS: SidebarTab[] = ["stores", "cities", "insights", "renewals", "layers", "quality"];
const ONLY: OnlyFilter[] = ["unclear", "outside", "whitespace"];
const oneOf = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
  value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
const text = (value: string | null, max: number) => (value ?? "").trim().slice(0, max);

/** The view in a link's query string; anything missing or not recognised is left at its default. */
export function parseUrlState(search: string): UrlState {
  const p = new URLSearchParams(search);
  return {
    tab: oneOf(p.get("tab"), TABS, "stores"),
    q: text(p.get("q"), 200),
    live: oneOf(p.get("live"), ["all", "live", "notlive"] as const, "all"),
    paid: oneOf(p.get("paid"), ["all", "paid", "notpaid"] as const, "all"),
    renewal: oneOf(p.get("renewal"), ["all", "renew", "expired"] as const, "all"),
    city: text(p.get("city"), 100),
    only: ONLY.includes(p.get("only") as OnlyFilter) ? (p.get("only") as OnlyFilter) : null,
    store: text(p.get("store"), 50) || null,
  };
}

/** The query string for a view ("" for the default view), with only the keys that differ from the default. */
export function urlStateToSearch(state: UrlState): string {
  const p = new URLSearchParams();
  if (state.tab !== "stores") p.set("tab", state.tab);
  if (state.q.trim()) p.set("q", state.q.trim());
  if (state.live !== "all") p.set("live", state.live);
  if (state.paid !== "all") p.set("paid", state.paid);
  if (state.renewal !== "all") p.set("renewal", state.renewal);
  if (state.city) p.set("city", state.city);
  if (state.only) p.set("only", state.only);
  if (state.store) p.set("store", state.store);
  const query = p.toString();
  return query ? `?${query}` : "";
}
