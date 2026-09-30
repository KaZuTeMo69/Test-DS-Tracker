import { Settings, toSettings } from "./settings";

// What the app remembers between visits. It stays in this browser only.
const SHEET_ID_KEY = "dst.sheetId";
const SETTINGS_KEY = "dst.settings";
const PANEL_OPEN_KEY = "dst.panelOpen";
const ORS_KEY = "dst.orsKey";
const BASE_MAP_KEY = "dst.baseMap";

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

// ── Routing ──

/** The OpenRouteService API key the user added in Settings; kept in this browser only, never in a link. */
export const loadOrsKey = () => (read(ORS_KEY) ?? "").trim();

export const saveOrsKey = (key: string) => write(ORS_KEY, key.trim() || null);

// ── Base map ──

/** The base map chosen on the map, and the last light one (the night button goes back to it); unchecked here. */
export function loadBaseMap(): { base?: string; day?: string } {
  try {
    const saved = JSON.parse(read(BASE_MAP_KEY) || "null");
    return saved && typeof saved === "object" ? saved : {};
  } catch {
    return {};
  }
}

export const saveBaseMap = (choice: { base: string; day: string }) => write(BASE_MAP_KEY, JSON.stringify(choice));
