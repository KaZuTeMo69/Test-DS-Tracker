import { Store } from "../../types";
import { PinColors } from "../../lib/settings";
import { RentBenchmarks, RentLevel } from "../../lib/rentStats";
import { OpdLevel } from "../../lib/cpo";
import { OPD_COLOR, PinShape, pinShape, RENT_COLOR, STATUS_COLOR } from "./pinIcon";
import type { OrderColours } from "./StoreMarkers";

/** What a store's pin colour stands for in the colour mode shown: its colour, and how a cluster's tooltip says it. */
export interface PinCategory {
  key: string; // the mode and the category, as "rent:below"
  order: number; // the legend's order
  color: string;
  label: string;
}

const STATUS_LABEL: Record<PinShape, string> = {
  round: "live and paid",
  square: "live but unpaid",
  triangle: "not live",
};
const STATUS_ORDER: PinShape[] = ["round", "square", "triangle"];

const BAND_ORDER: RentLevel[] = ["below", "above", "high", "none"];
const bandLabel = (level: RentLevel, flagPercent: number) =>
  ({
    below: "at or below median",
    above: `up to ${flagPercent}% above`,
    high: `over ${flagPercent}% above`,
    none: "not compared",
  })[level];

const OPD_ORDER: OpdLevel[] = ["q1", "q2", "q3", "q4", "none"];
const OPD_LABEL: Record<OpdLevel, string> = {
  q1: "lowest OPD",
  q2: "lower OPD",
  q3: "higher OPD",
  q4: "highest OPD",
  none: "no OPD",
};

// One object per category, so a store's category is the same object from one render to the next (its pin isn't redrawn)
const interned = new Map<string, PinCategory>();
const intern = (c: PinCategory) => {
  const known = interned.get(c.key);
  if (known) return known;
  interned.set(c.key, c);
  return c;
};

/**
 * The colour category of a store's pin: its status (the shape's colour), its rent per m² or CPO against the city
 * median (in the bands set in Settings), or its OPD quartile.
 */
export function pinCategory(
  mode: PinColors,
  s: Store,
  benchmarks: RentBenchmarks,
  orders: OrderColours,
  flagPercent: number,
): PinCategory {
  return intern(categoryOf(mode, s, benchmarks, orders, flagPercent));
}

function categoryOf(
  mode: PinColors,
  s: Store,
  benchmarks: RentBenchmarks,
  orders: OrderColours,
  flagPercent: number,
): PinCategory {
  if (mode === "opd") {
    const q = orders.opd.get(s.id) ?? "none";
    return { key: `opd:${q}`, order: OPD_ORDER.indexOf(q), color: OPD_COLOR[q], label: OPD_LABEL[q] };
  }
  if (mode === "rent" || mode === "cpo") {
    const level = (mode === "rent" ? benchmarks.of.get(s.id) : orders.cpo.get(s.id))?.level ?? "none";
    return {
      key: `${mode}:${level}:${flagPercent}`,
      order: BAND_ORDER.indexOf(level),
      color: RENT_COLOR[level],
      label: bandLabel(level, flagPercent),
    };
  }
  const shape = pinShape(s);
  return {
    key: `status:${shape}`,
    order: STATUS_ORDER.indexOf(shape),
    color: STATUS_COLOR[shape],
    label: STATUS_LABEL[shape],
  };
}
