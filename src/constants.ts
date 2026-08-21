import { Store } from "./types";

export const PIN_SEL = "#38BDF8";

export const isLive = (s: Store) => {
  if (!s.live) return true;
  const val = String(s.live).toLowerCase();
  if (val === "yes" || val === "y" || val === "live" || val === "true") return true;
  if (val === "no" || val === "n" || val === "not live" || val === "false") return false;
  return !/not/i.test(val);
};

export const isPaid = (s: Store) => {
  if (!s.paid) return true;
  const val = String(s.paid).toLowerCase();
  if (val === "yes" || val === "y" || val === "paid" || val === "true") return true;
  if (val === "no" || val === "n" || val === "unpaid" || val === "false") return false;
  return !/not/i.test(val) && !/un/i.test(val);
};
export const hasCoords = (s: Store) => s.lat !== null && s.lng !== null;

export function pn(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[^0-9.-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

export function fmtN(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(0) + "K";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

export function getRent(s: Store, currency: "USD" | "AED" | "SAR"): number {
  if (currency === "AED") return s.rentAEDAnnual;
  if (currency === "SAR") return s.rentSARAnnual;
  return s.rentUSDAnnual;
}

export function fmtR(v: string | number | null | undefined): string {
  const n = pn(v);
  if (n === null) return String(v ?? "—");
  return n >= 1000 ? (n / 1000).toFixed(0) + "K" : String(Math.round(n));
}

export function pinColor(s: Store): string {
  if (!isLive(s)) return "#f87171"; // Red 400
  return isPaid(s) ? "#4ade80" : "#fbbf24"; // Green 400 or Amber 400
}
