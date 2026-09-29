import { Store } from "../types";
import { Settings, toSettings } from "./settings";

// What the app remembers between visits. It stays in this browser only.
const SHEET_ID_KEY = "dst.sheetId";
const MANUAL_STORES_KEY = "dst.manualStores";
const SETTINGS_KEY = "dst.settings";
const PANEL_OPEN_KEY = "dst.panelOpen";

export type ManualStore = Omit<Store, "id">;

// localStorage can be missing or throw (private browsing, blocked site data); the app then works without it
function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Not saved; everything still works until the page is closed
  }
}

// ── Google Sheet ──

export function loadSheetId(): string {
  const id = read(SHEET_ID_KEY);
  return id && /^[a-zA-Z0-9\-_]+$/.test(id) ? id : "";
}

export const saveSheetId = (id: string) => write(SHEET_ID_KEY, id || null);

// ── Manual stores ──

const text = (v: unknown) => (typeof v === "string" ? v : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A saved manual store, or null if the entry is damaged (no name or no valid coordinates). */
function toManualStore(raw: unknown): ManualStore | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = text(r.name).trim();
  const lat = num(r.lat);
  const lng = num(r.lng);
  if (!name || lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return {
    name,
    dsCode: text(r.dsCode),
    city: text(r.city),
    country: text(r.country) || "KSA",
    contractDuration: text(r.contractDuration),
    startDate: text(r.startDate),
    endDate: text(r.endDate),
    live: text(r.live),
    paid: text(r.paid),
    size: num(r.size),
    rentSARAnnual: num(r.rentSARAnnual),
    rentSARMonthly: num(r.rentSARMonthly),
    rentSARsqm: num(r.rentSARsqm),
    lat,
    lng,
  };
}

/** Manual stores saved on an earlier visit; damaged entries are skipped, and unreadable data counts as none. */
export function loadManualStores(): ManualStore[] {
  const saved = read(MANUAL_STORES_KEY);
  if (!saved) return [];
  try {
    const list: unknown = JSON.parse(saved);
    return Array.isArray(list) ? list.map(toManualStore).filter((s): s is ManualStore => s !== null) : [];
  } catch {
    return [];
  }
}

export function saveManualStores(stores: Store[]) {
  // Ids are handed out again on every load, so they aren't saved
  write(MANUAL_STORES_KEY, stores.length ? JSON.stringify(stores.map(({ id: _id, ...store }) => store)) : null);
}

// ── Settings ──

export function loadSettings(): Settings {
  const saved = read(SETTINGS_KEY);
  try {
    return toSettings(saved ? JSON.parse(saved) : null);
  } catch {
    return toSettings(null);
  }
}

export const saveSettings = (settings: Settings) => write(SETTINGS_KEY, JSON.stringify(settings));

// ── Layout ──

/** Whether the side panel was left open, or null if it was never opened or closed here. */
export function loadPanelOpen(): boolean | null {
  const saved = read(PANEL_OPEN_KEY);
  return saved === "1" ? true : saved === "0" ? false : null;
}

export const savePanelOpen = (open: boolean) => write(PANEL_OPEN_KEY, open ? "1" : "0");
