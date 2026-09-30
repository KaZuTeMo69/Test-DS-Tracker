import L from "leaflet";
import { Store } from "../../types";
import { PinSize, RentLevel } from "../../lib/rentStats";
import { isLive, isPaid } from "../../lib/status";

// Fix for default marker icons in Leaflet
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerIconRetina from "leaflet/dist/images/marker-icon-2x.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIconRetina,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/**
 * The pin's shape shows the store's status, whatever the colours show: round, square or a warning triangle.
 * (Diamonds are the Potentials' pins.)
 */
export type PinShape = "round" | "square" | "triangle";

export const pinShape = (s: Store): PinShape => (!isLive(s) ? "triangle" : isPaid(s) ? "round" : "square");

// Colours when the pins show status: Green 400, Amber 400, Red 400
export const STATUS_COLOR: Record<PinShape, string> = { round: "#4ade80", square: "#fbbf24", triangle: "#f87171" };

// Colours when the pins show rent per m² against the city median
export const RENT_COLOR: Record<RentLevel, string> = {
  below: "#4ade80",
  above: "#fbbf24",
  high: "#f87171",
  none: "#9ca3af",
};

// Drawn in a 24 × 32 box with the point at the bottom middle; the white mark sits at MARK_Y
export const PIN_PATH: Record<PinShape, string> = {
  round: "M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z",
  square:
    "M3.5 1h17A3.5 3.5 0 0 1 24 4.5v14a3.5 3.5 0 0 1-3.5 3.5H16L12 32l-4-10H3.5A3.5 3.5 0 0 1 0 18.5v-14A3.5 3.5 0 0 1 3.5 1z",
  // Point up like a warning sign, on a short tail down to the spot
  triangle: "M10.3 1.1a2 2 0 0 1 3.4 0L23.7 19.1A2 2 0 0 1 22 22H15.2L12 32L8.8 22H2a2 2 0 0 1-1.7-2.9z",
};
const MARK_Y: Record<PinShape, number> = { round: 12, square: 11.5, triangle: 14.5 };

// Pin widths by annual rent (lowest, middle and highest third)
const WIDTH: Record<PinSize, number> = { s: 24, m: 30, l: 37 };

// Icons are cached so re-renders hand Leaflet the same icon object instead of rebuilding every pin
const iconCache = new Map<string, L.DivIcon>();

export function makeIcon(color: string, shape: PinShape = "round", size: PinSize = "m", selected = false) {
  const cacheKey = `${color}|${shape}|${size}|${selected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const sz = WIDTH[size] + (selected ? 8 : 0);
  const h = Math.round(sz * 1.35);
  const markR = selected ? 5.5 : 4.5;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${h}" viewBox="0 0 24 32" data-shape="${shape}" data-size="${size}">
      <defs>
        <filter id="pin-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
          <feOffset dx="0" dy="1.5" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${selected ? `<circle cx="12" cy="12" r="11" fill="${color}" opacity="0.25" />` : ""}
      <path filter="url(#pin-shadow)" d="${PIN_PATH[shape]}" fill="${color}" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>
      <circle cx="12" cy="${MARK_Y[shape]}" r="${markR}" fill="white"/>
    </svg>
  `;

  const icon = L.divIcon({
    html: svg,
    className: "",
    iconSize: [sz, h],
    iconAnchor: [sz / 2, h],
    popupAnchor: [0, -h],
  });
  iconCache.set(cacheKey, icon);
  return icon;
}

// ── Potentials: diamonds, coloured by status ──

export const DIAMOND_PATH = "M12 0L24 12.5L12 32L0 12.5z";
const POTENTIAL_WIDTH = 26;
const potentialIconCache = new Map<string, L.DivIcon>();

/**
 * A Potential's pin: a diamond in its status colour with a small white diamond inside. The dark grey of dropped
 * ones gets a light outline so it shows on the night map. Selected: bigger, with a white halo (not the selected
 * stores' sky blue, which is close to the backup blue). The form's pin (moving) has a dashed white outline.
 */
export function potentialIcon(color: string, { selected = false, moving = false, light = false } = {}) {
  const key = `${color}|${selected}|${moving}|${light}`;
  const cached = potentialIconCache.get(key);
  if (cached) return cached;
  const sz = POTENTIAL_WIDTH + (selected || moving ? 8 : 0);
  const h = Math.round(sz * 1.35);
  const stroke = moving ? "#ffffff" : light ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.45)";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${h}" viewBox="0 0 24 32" data-shape="potential" ${moving ? 'data-moving="1"' : ""}>
      ${selected ? `<path d="${DIAMOND_PATH}" fill="none" stroke="#ffffff" stroke-width="3.2" opacity="0.9" transform="translate(12 16) scale(1.12) translate(-12 -16)"/>` : ""}
      <path d="${DIAMOND_PATH}" fill="${color}" stroke="${stroke}" stroke-width="${moving ? 1.6 : 1.1}" ${moving ? 'stroke-dasharray="2.4 1.8"' : ""}/>
      <path d="M12 7.5L16.6 12.5L12 18.8L7.4 12.5z" fill="white"/>
    </svg>
  `;
  const icon = L.divIcon({
    html: svg,
    className: `potential-pin${moving ? " moving" : ""}`,
    iconSize: [sz, h],
    iconAnchor: [sz / 2, h],
    popupAnchor: [0, -h],
  });
  potentialIconCache.set(key, icon);
  return icon;
}
