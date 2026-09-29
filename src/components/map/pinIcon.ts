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

/** The pin's shape shows the store's status, whatever the colours show: round, square or diamond. */
export type PinShape = "round" | "square" | "diamond";

export const pinShape = (s: Store): PinShape => (!isLive(s) ? "diamond" : isPaid(s) ? "round" : "square");

// Colours when the pins show status: Green 400, Amber 400, Red 400
export const STATUS_COLOR: Record<PinShape, string> = { round: "#4ade80", square: "#fbbf24", diamond: "#f87171" };

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
  diamond: "M12 0L24 12.5L12 32L0 12.5z",
};
const MARK_Y: Record<PinShape, number> = { round: 12, square: 11.5, diamond: 12.5 };

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
