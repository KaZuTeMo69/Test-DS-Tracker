import { createContext, useContext, useState } from "react";
import { DEFAULT_SETTINGS, Settings } from "../lib/settings";
import { loadSettings, saveSettings } from "../lib/storage";

// The settings, for the parts of the page far below App (list rows, the store card, totals, charts)
export const SettingsContext = createContext<Settings>(DEFAULT_SETTINGS);

export const useSettings = () => useContext(SettingsContext);

/** The settings, loaded from this browser, and a way to change them; each change is saved at once. */
export function useSettingsState() {
  const [settings, setSettings] = useState(loadSettings);
  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next);
  };
  return { settings, updateSettings };
}
