/**
 * A store cluster on the map: a dark disc with the count, in a ring split into the colours of the stores inside, in
 * the colour mode shown (status, rent per m², CPO or OPD). So the colours stay readable when zoomed out.
 */

/** One colour category inside a cluster: its colour, how it's said ("at or below median"), and how many. */
export interface RingPart {
  key: string;
  order: number; // the legend's order
  color: string;
  label: string;
  count: number;
}

/** The cluster's width in px: it grows gently with the count (about 30 for 2, 35 for 10, 42 for 100, 49 for 1,000). */
export const clusterDiameter = (count: number) => Math.round(Math.min(52, 28 + 7 * Math.log10(Math.max(count, 2))));

export interface RingSegment {
  color: string;
  start: number; // px along the ring, clockwise from the top
  length: number;
}

/**
 * Each part's arc around a ring: in proportion to its count, with a gap between parts (the dark disc shows
 * through), and at least `minLength` so a part of one store in hundreds still shows. One part is the whole ring.
 */
export function ringSegments(parts: RingPart[], circumference: number, gap = 2, minLength = 3): RingSegment[] {
  const shown = parts.filter((p) => p.count > 0);
  if (!shown.length) return [];
  if (shown.length === 1) return [{ color: shown[0].color, start: 0, length: circumference }];
  const total = shown.reduce((a, p) => a + p.count, 0);
  const room = circumference - gap * shown.length;
  // Parts under the minimum are raised to it; the others share what's left by count
  const small = shown.map((p) => (p.count / total) * room < minLength);
  const fixed = small.filter(Boolean).length * minLength;
  const rest = shown.reduce((a, p, i) => (small[i] ? a : a + p.count), 0);
  let at = gap / 2;
  return shown.map((p, i) => {
    const length = small[i] ? minLength : (p.count / rest) * (room - fixed);
    const segment = { color: p.color, start: at, length };
    at += length + gap;
    return segment;
  });
}

/** The parts in the legend's order, without empty ones. */
export const sortedParts = (parts: RingPart[]) => parts.filter((p) => p.count > 0).sort((a, b) => a.order - b.order);

/** In words, for the tooltip: "4 stores: 2 at or below median, 1 up to 25% above, 1 over 25% above". */
export function clusterWords(parts: RingPart[]): string {
  const shown = sortedParts(parts);
  const total = shown.reduce((a, p) => a + p.count, 0);
  const n = (v: number) => v.toLocaleString("en-US");
  return `${n(total)} ${total === 1 ? "store" : "stores"}: ${shown.map((p) => `${n(p.count)} ${p.label}`).join(", ")}`;
}

const countText = (n: number) =>
  n < 1000 ? String(n) : `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, "")}K`;

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The cluster's icon as inline SVG: a #141414 disc with a thin #333 edge and the count in white, inside a ring of
 * coloured arcs. Returns the markup and its width (the icon is square).
 */
export function clusterSvg(parts: RingPart[]): { html: string; size: number } {
  const shown = sortedParts(parts);
  const total = shown.reduce((a, p) => a + p.count, 0);
  const d = clusterDiameter(total);
  const c = d / 2;
  const ring = Math.max(4, Math.min(6, Math.round(d * 0.13)));
  // The ring sits just inside the edge, so the dark disc rims it and shows through the gaps between colours
  const r = c - ring / 2 - 1;
  const circumference = 2 * Math.PI * r;
  const arcs = ringSegments(shown, circumference)
    .map(
      (s) =>
        `<circle cx="${c}" cy="${c}" r="${r.toFixed(2)}" fill="none" stroke="${s.color}" stroke-width="${ring}" ` +
        `stroke-dasharray="${s.length.toFixed(2)} ${(circumference - s.length).toFixed(2)}" ` +
        `stroke-dashoffset="${(-s.start).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`,
    )
    .join("");
  const inner = r - ring / 2 - 1;
  const fontSize = d < 34 ? 11 : d < 42 ? 12 : 13;
  const html =
    `<div class="store-cluster" role="img" aria-label="${attr(clusterWords(shown))}" data-count="${total}">` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 ${d} ${d}">` +
    `<circle cx="${c}" cy="${c}" r="${c}" fill="#141414"/>${arcs}` +
    `<circle cx="${c}" cy="${c}" r="${inner.toFixed(2)}" fill="#141414" stroke="#333333" stroke-width="1"/>` +
    `<text x="${c}" y="${c}" dy="0.35em" text-anchor="middle" fill="#ffffff" font-size="${fontSize}" ` +
    `font-weight="800" font-family="'DM Sans', sans-serif">${countText(total)}</text></svg></div>`;
  return { html, size: d };
}
