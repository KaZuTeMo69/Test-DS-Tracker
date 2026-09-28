import L from "leaflet";
import { Store } from "../../types";
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

export function pinColor(s: Store): string {
  if (!isLive(s)) return "#f87171"; // Red 400
  return isPaid(s) ? "#4ade80" : "#fbbf24"; // Green 400 or Amber 400
}

// Icons are cached so re-renders hand Leaflet the same icon object instead of rebuilding every pin
const iconCache = new Map<string, L.DivIcon>();

export function makeIcon(color: string, selected = false) {
  const cacheKey = `${color}|${selected}`;
  const cached = iconCache.get(cacheKey);
  if (cached) return cached;

  const sz = selected ? 38 : 30;
  const h = Math.round(sz * 1.35);
  const innerR = selected ? 6 : 4.5;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${sz}" height="${h}" viewBox="0 0 24 32">
      <defs>
        <filter id="pin-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="1" />
          <feOffset dx="0" dy="1.5" result="offsetblur" />
          <feComponentTransfer><feFuncA type="linear" slope="0.4"/></feComponentTransfer>
          <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      ${selected ? `<circle cx="12" cy="12" r="10" fill="${color}" opacity="0.25" />` : ""}
      <path filter="url(#pin-shadow)" d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20c0-6.63-5.37-12-12-12z" fill="${color}"/>
      <circle cx="12" cy="12" r="${innerR}" fill="white"/>
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
