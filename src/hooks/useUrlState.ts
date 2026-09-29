import { useEffect, useRef } from "react";
import { SidebarTab, Store } from "../types";
import { Filters } from "./useFilters";
import { parseUrlState, UrlState, urlStateToSearch } from "../lib/urlState";

/** The view in the page's link when it opened. Read once; the filters and tab start from it. */
export const linkedView: UrlState = parseUrlState(typeof window === "undefined" ? "" : window.location.search);

/**
 * Keeps the page's link in step with the view (filters, tab, selected store), so it can be bookmarked or shared,
 * and selects the linked store once the stores have loaded. The link never holds the Google Sheet ID or any data.
 */
export function useUrlState({
  filters,
  currentTab,
  selectedStore,
  stores,
  storesReady,
  onSelectStore,
  showToast,
}: {
  filters: Filters;
  currentTab: SidebarTab;
  selectedStore: Store | null;
  stores: Store[];
  storesReady: boolean; // false while a saved Google Sheet is still loading
  onSelectStore: (id: number) => void;
  showToast: (message: string) => void;
}) {
  // The linked store and city, until the stores they belong to have loaded
  const pendingStore = useRef(linkedView.store);
  const pendingCity = useRef(linkedView.city);
  const { setCityFilter } = filters;

  // A linked city that isn't in these stores would leave the list empty for no clear reason
  useEffect(() => {
    const city = pendingCity.current;
    if (!city || !storesReady) return;
    pendingCity.current = "";
    if (stores.some((s) => s.city === city)) return;
    setCityFilter("");
    showToast(`The link's city ${city} isn't in the data shown here, so all cities are shown`);
  }, [storesReady, stores, setCityFilter, showToast]);

  useEffect(() => {
    const code = pendingStore.current;
    if (!code || !storesReady) return;
    pendingStore.current = null;
    const match = stores.find((s) => s.dsCode.trim().toUpperCase() === code.toUpperCase());
    if (match) onSelectStore(match.id);
    else showToast(`The link's store ${code} isn't in the data shown here`);
  }, [storesReady, stores, onSelectStore, showToast]);

  const view: UrlState = {
    tab: currentTab,
    q: filters.searchQuery,
    live: filters.liveFilter,
    paid: filters.paidFilter,
    renewal: filters.renewalFilter,
    city: filters.cityFilter,
    only: filters.unclearOnly ? "unclear" : filters.coverageOnly,
    store: selectedStore?.dsCode.trim() || pendingStore.current,
  };
  const search = urlStateToSearch(view);

  useEffect(() => {
    if (search === window.location.search) return;
    // Replaced rather than added, so the Back button leaves the app instead of stepping through every filter change
    window.history.replaceState(
      window.history.state,
      "",
      `${window.location.pathname}${search}${window.location.hash}`,
    );
  }, [search]);
}
