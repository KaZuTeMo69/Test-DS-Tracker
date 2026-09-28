import { RENEWAL_LEAD_DAYS, RENEWAL_WARNING_DAYS, RenewalDays } from "./contract";

/** How renewals are worked out and how rent is shown. Saved in this browser. */
export interface Settings extends RenewalDays {
  includeVat: boolean; // show rent with VAT added; the sheet's rent is without VAT
}

export const VAT_RATE = 0.15;
export const MAX_DAYS = 365;

export const DEFAULT_SETTINGS: Settings = {
  leadDays: RENEWAL_LEAD_DAYS,
  warningDays: RENEWAL_WARNING_DAYS,
  includeVat: false,
};

/** A whole number of days from 0 to MAX_DAYS, or null. */
export function toDays(v: unknown): number | null {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= MAX_DAYS ? n : null;
}

/** Saved settings, with anything missing or unreadable set to its default. */
export function toSettings(v: unknown): Settings {
  const o = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  return {
    leadDays: toDays(o.leadDays) ?? DEFAULT_SETTINGS.leadDays,
    warningDays: toDays(o.warningDays) ?? DEFAULT_SETTINGS.warningDays,
    includeVat: typeof o.includeVat === "boolean" ? o.includeVat : DEFAULT_SETTINGS.includeVat,
  };
}

/** What rent figures are multiplied by when shown: 1.15 with VAT included, otherwise 1. */
export const rentFactor = (includeVat: boolean) => (includeVat ? 1 + VAT_RATE : 1);

/** A rent figure as shown: with VAT added when that setting is on. */
export const shownRent = (n: number | null, settings: Settings): number | null =>
  n === null ? null : n * rentFactor(settings.includeVat);

/** Added to rent labels while VAT is included. */
export const vatLabel = (settings: Settings) => (settings.includeVat ? "incl. VAT" : "");
