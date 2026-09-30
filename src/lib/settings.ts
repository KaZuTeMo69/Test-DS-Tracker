import { RENEWAL_LEAD_DAYS, RENEWAL_WARNING_DAYS, RenewalDays } from "./contract";

/** What the pin colours show: Live / Paid status, or rent per m² against the city median. */
export type PinColors = "status" | "rent";

/** How renewals are worked out and how rent is shown. Saved in this browser. */
export interface Settings extends RenewalDays {
  includeVat: boolean; // show rent with VAT added; the sheet's rent is without VAT
  rentFlagPercent: number; // flag rent per m² more than this % above the city median
  pinColors: PinColors;
  // Potentials on the map: shown or not, and the dropped ones separately (hidden unless asked for)
  showPotentials: boolean;
  showDroppedPotentials: boolean;
  addedBy: string; // your name, put on the Potentials you add
}

export const VAT_RATE = 0.15;
export const MAX_DAYS = 365;
export const MAX_PERCENT = 500;

export const DEFAULT_SETTINGS: Settings = {
  leadDays: RENEWAL_LEAD_DAYS,
  warningDays: RENEWAL_WARNING_DAYS,
  includeVat: false,
  rentFlagPercent: 25,
  pinColors: "status",
  showPotentials: true,
  showDroppedPotentials: false,
  addedBy: "",
};

/** A whole number from 0 to max, typed or saved, or null. */
export function toWholeNumber(v: unknown, max: number): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** A whole number of days from 0 to MAX_DAYS, or null. */
export const toDays = (v: unknown) => toWholeNumber(v, MAX_DAYS);

/** Saved settings, with anything missing or unreadable set to its default. */
export function toSettings(v: unknown): Settings {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    leadDays: toDays(o.leadDays) ?? DEFAULT_SETTINGS.leadDays,
    warningDays: toDays(o.warningDays) ?? DEFAULT_SETTINGS.warningDays,
    includeVat: typeof o.includeVat === "boolean" ? o.includeVat : DEFAULT_SETTINGS.includeVat,
    rentFlagPercent: toWholeNumber(o.rentFlagPercent, MAX_PERCENT) ?? DEFAULT_SETTINGS.rentFlagPercent,
    pinColors: o.pinColors === "rent" || o.pinColors === "status" ? o.pinColors : DEFAULT_SETTINGS.pinColors,
    showPotentials: typeof o.showPotentials === "boolean" ? o.showPotentials : DEFAULT_SETTINGS.showPotentials,
    showDroppedPotentials:
      typeof o.showDroppedPotentials === "boolean" ? o.showDroppedPotentials : DEFAULT_SETTINGS.showDroppedPotentials,
    addedBy: typeof o.addedBy === "string" ? o.addedBy.slice(0, 80) : DEFAULT_SETTINGS.addedBy,
  };
}

/** What rent figures are multiplied by when shown: 1.15 with VAT included, otherwise 1. */
export const rentFactor = (includeVat: boolean) => (includeVat ? 1 + VAT_RATE : 1);

/** A rent figure as shown: with VAT added when that setting is on. */
export const shownRent = (n: number | null, settings: Settings): number | null =>
  n === null ? null : n * rentFactor(settings.includeVat);

/** Added to rent labels while VAT is included. */
export const vatLabel = (settings: Settings) => (settings.includeVat ? "incl. VAT" : "");
