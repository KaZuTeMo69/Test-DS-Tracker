import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Store } from "../types";
import { SAMPLE_STORES } from "../data/sampleStores";
import { fetchSheetData } from "../lib/sheets";
import { loadManualStores, loadSheetId, ManualStore, saveManualStores, saveSheetId } from "../lib/storage";

// The sheet tab that holds the store list
const SHEET_TAB = "All Countries";

// Manually added stores get ids from here up, so they never collide with imported stores
const MANUAL_ID_BASE = 1_000_000;

export const isManualStore = (s: Store) => s.id > MANUAL_ID_BASE;

const withManualIds = (list: ManualStore[]): Store[] => list.map((s, i) => ({ ...s, id: MANUAL_ID_BASE + i + 1 }));

// How a sheet load started: a link entered in the upload window, the sheet saved on an earlier visit,
// the Sync Sheet button, or the 5-minute auto-refresh
type SheetLoad = "import" | "restore" | "manual" | "auto";

const syncTime = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Gives each store the same id on every load (keyed by DS code, else name + city), so a
 * sheet refresh doesn't make the open store or the map pins jump to a different store
 * when rows are inserted or removed in the sheet.
 */
function assignStableIds(list: Store[], idsByKey: Map<string, number>): Store[] {
  const seen = new Map<string, number>();
  return list.map((s) => {
    const base = s.dsCode.trim()
      ? `code:${s.dsCode.trim().toLowerCase()}`
      : `name:${s.name.trim().toLowerCase()}|${s.city.trim().toLowerCase()}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const key = `${base}#${n}`;
    let id = idsByKey.get(key);
    if (id === undefined) {
      id = idsByKey.size + 1;
      idsByKey.set(key, id);
    }
    return { ...s, id };
  });
}

/**
 * The store data and where it comes from: the sample stores, a Google Sheet (kept in sync every 5 minutes)
 * or an imported file, plus the manually added stores. The sheet link and manual stores are saved in this
 * browser. `notify` shows a short message to the user.
 */
export function useStores(notify: (msg: string) => void) {
  // Data source: the sample stores, a Google Sheet (sheetId set) or an imported file (fileName set)
  const storeIdsRef = useRef(new Map<string, number>());
  // Bumped by every load or import; a sheet request that finishes after a newer one started is ignored
  const loadSeqRef = useRef(0);
  const [sheetId, setSheetId] = useState(loadSheetId);
  const [fileName, setFileName] = useState<string | null>(null);
  // Stores from the sample data, sheet or imported file. While a saved sheet is loading there are none,
  // so the sample stores never show as if they were yours
  const [baseStores, setBaseStores] = useState<Store[]>(() =>
    sheetId ? [] : assignStableIds(SAMPLE_STORES, storeIdsRef.current),
  );
  // Kept separately, and saved in this browser, so reloads and new data don't wipe them
  const [manualStores, setManualStores] = useState<Store[]>(() => withManualIds(loadManualStores()));

  // Loading and sync status
  const [isLoading, setIsLoading] = useState(false); // a sheet link from the upload window is loading
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState<string | null>(null); // shown in the upload window
  const [isSyncing, setIsSyncing] = useState(false); // any sheet request in flight
  const sheetBusyRef = useRef(false); // the same, for the auto-refresh timer
  const [syncError, setSyncError] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string>(""); // time of the last successful sheet load
  const syncFailedRef = useRef(false);

  const loadDataFromSheet = useCallback(
    async (id: string, mode: SheetLoad): Promise<boolean> => {
      // The auto-refresh waits for its next turn rather than cutting off a load in progress (such as a new sheet link)
      if (mode === "auto" && sheetBusyRef.current) return false;
      const seq = ++loadSeqRef.current;
      sheetBusyRef.current = true;
      setIsSyncing(true);
      if (mode === "import") {
        setIsLoading(true);
        setLoadingMsg("Connecting to Google Sheets...");
      }

      try {
        const data = await fetchSheetData(id, SHEET_TAB);
        if (seq !== loadSeqRef.current) return false;

        if (data.length === 0) {
          throw new Error("No store data found in this sheet. Please ensure it follows the required column schema.");
        }

        setBaseStores(assignStableIds(data, storeIdsRef.current));
        setFileName(null);
        setLastSync(syncTime());
        setError(null);
        setSyncError(null);
        syncFailedRef.current = false;

        if (mode === "import" || mode === "restore") notify(`Loaded ${data.length} stores from Google Sheet`);
        if (mode === "manual") notify("Google Sheet synced");
        return true;
      } catch (err: unknown) {
        if (seq !== loadSeqRef.current) return false;
        const errMsg = err instanceof Error ? err.message : String(err);
        if (mode === "import") {
          setError(errMsg || "Failed to load data. Please check Sheet URL and permissions.");
        } else {
          // Keep showing the last good data (if any); the header badge says it's stale. The auto-refresh
          // only announces its first failure, not one every 5 minutes
          if (mode !== "auto" || !syncFailedRef.current) notify(`Sheet sync failed: ${errMsg}`);
          setSyncError(errMsg || "Sheet sync failed");
          syncFailedRef.current = true;
        }
        return false;
      } finally {
        if (seq === loadSeqRef.current) {
          sheetBusyRef.current = false;
          setIsSyncing(false);
          setIsLoading(false);
        }
      }
    },
    [notify],
  );

  // Load the sheet saved on an earlier visit, once at start (a sheet linked later is loaded by its import)
  const savedSheetIdRef = useRef(sheetId);
  useEffect(() => {
    if (savedSheetIdRef.current) loadDataFromSheet(savedSheetIdRef.current, "restore");
  }, [loadDataFromSheet]);

  // Auto-refresh every 5 minutes while a sheet is linked
  useEffect(() => {
    if (!sheetId) return;
    const timer = setInterval(() => loadDataFromSheet(sheetId, "auto"), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [sheetId, loadDataFromSheet]);

  // Remember manual stores between visits
  useEffect(() => saveManualStores(manualStores), [manualStores]);

  // Stops any sheet request in progress and forgets the sheet
  const stopSheet = () => {
    loadSeqRef.current++;
    sheetBusyRef.current = false;
    setIsLoading(false);
    setIsSyncing(false);
    setSheetId("");
    saveSheetId("");
    setSyncError(null);
    syncFailedRef.current = false;
    setLastSync("");
  };

  /** Loads a Google Sheet from its link; true once it has loaded (and is then remembered and kept in sync). */
  const importSheet = async (url: string): Promise<boolean> => {
    const m = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9\-_]+)/);
    if (!m) {
      setError("Invalid Google Sheets URL. Please copy the full URL from your browser address bar.");
      return false;
    }
    const id = m[1];
    setError(null);
    // Only remember (and auto-refresh) the sheet once it has loaded successfully
    if (await loadDataFromSheet(id, "import")) {
      setSheetId(id);
      saveSheetId(id);
      return true;
    }
    return false;
  };

  const syncSheet = () => {
    if (sheetId) loadDataFromSheet(sheetId, "manual");
  };

  const importStores = (importedStores: Store[], sourceName: string) => {
    // The file replaces the sheet as the data source, so stop syncing the sheet;
    // otherwise the next auto-refresh would overwrite the imported stores
    const wasSyncing = !!sheetId;
    stopSheet();
    setFileName(sourceName);
    setBaseStores(assignStableIds(importedStores, storeIdsRef.current));
    notify(
      `Successfully imported ${importedStores.length} stores from ${sourceName}${wasSyncing ? ". Google Sheet sync is off" : ""}`,
    );
  };

  const resetSample = () => {
    stopSheet();
    setBaseStores(assignStableIds(SAMPLE_STORES, storeIdsRef.current));
    setManualStores([]); // also removes the saved copy
    setFileName(null);
    notify("Reset to sample data. The saved sheet link and manual stores are cleared");
  };

  const addManualStore = useCallback((newStore: ManualStore) => {
    setManualStores((prev) => {
      const id = prev.reduce((max, s) => Math.max(max, s.id), MANUAL_ID_BASE) + 1;
      return [...prev, { ...newStore, id }];
    });
  }, []);

  const removeManualStore = (id: number) => {
    setManualStores((prev) => prev.filter((s) => s.id !== id));
    notify("Manual store removed");
  };

  const stores = useMemo(() => [...baseStores, ...manualStores], [baseStores, manualStores]);

  return {
    stores,
    // Where the data comes from and whether it's current
    sheetId,
    fileName,
    lastSync,
    syncError,
    isSyncing,
    // A saved sheet that hasn't loaded yet (still connecting, or failed)
    awaitingSheet: !!sheetId && !lastSync,
    // Upload window state for a sheet link
    isLoading,
    loadingMsg,
    error,
    clearError: () => setError(null),
    // Actions
    importSheet,
    syncSheet,
    importStores,
    resetSample,
    addManualStore,
    removeManualStore,
  };
}
