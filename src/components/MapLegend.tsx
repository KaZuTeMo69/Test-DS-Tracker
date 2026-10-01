import { ReactNode, useState } from "react";
import { ChevronUp } from "lucide-react";
import { PIN_SEL } from "../constants";
import { useSettings } from "../hooks/useSettings";
import { DIAMOND_PATH, OPD_COLOR, PIN_PATH, PinShape, RENT_COLOR, STATUS_COLOR } from "./map/pinIcon";
import { POTENTIAL_COLOR, POTENTIAL_STATUS_LABEL, POTENTIAL_STATUSES } from "../lib/potentials";

const SHAPE_LABEL: Record<PinShape, string> = { round: "Live · Paid", square: "Live · Unpaid", triangle: "Not live" };

// A small pin in the legend, drawn like the ones on the map
function Glyph({ shape, color }: { shape: PinShape | "potential"; color: string }) {
  return (
    <svg width="10" height="13" viewBox="0 0 24 32" aria-hidden="true" className="shrink-0">
      <path
        d={shape === "potential" ? DIAMOND_PATH : PIN_PATH[shape]}
        fill={color}
        stroke={shape === "potential" && color === POTENTIAL_COLOR.dropped ? "rgba(255,255,255,0.8)" : "none"}
        strokeWidth="1.6"
      />
    </svg>
  );
}

function Item({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div
      className="flex items-center gap-1.5 text-[11px] text-gray-300 font-bold uppercase tracking-tight"
      title={title}
    >
      {children}
    </div>
  );
}

const Dot = ({ color }: { color: string }) => (
  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
);

// A cluster in the legend: the dark disc in a ring of the mode's colours, as on the map
function Donut({ colors }: { colors: string[] }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const part = c / colors.length;
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <circle cx="8" cy="8" r="8" fill="#141414" />
      {colors.map((color, i) => (
        <circle
          key={color}
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeDasharray={`${part - 1} ${c - part + 1}`}
          strokeDashoffset={-i * part}
          transform="rotate(-90 8 8)"
        />
      ))}
      <circle cx="8" cy="8" r="3.4" fill="#141414" stroke="#333" strokeWidth="0.8" />
    </svg>
  );
}

/**
 * What the pins mean: the shape is the status and the size the annual rent; the colour is the status, rent per m²
 * or CPO against the city median, or OPD by quartile (chosen with the palette button in the map controls). Zoomed out
 * stores are dots, and a cluster's ring shows the mix inside. Also how many of the listed stores have no pin, and the
 * Potentials' diamonds when any are on the map. Folded into a small chip until opened.
 */
export default function MapLegend({ notOnMap, potentials = 0 }: { notOnMap: number; potentials?: number }) {
  const { pinColors, rentFlagPercent, clusterStores } = useSettings();
  const [open, setOpen] = useState(false);
  // Colours other than status: the shapes still say the status, in grey
  const byValue = pinColors !== "status";
  const shapes: PinShape[] = ["round", "square", "triangle"];
  const swatches =
    pinColors === "opd"
      ? [OPD_COLOR.q1, OPD_COLOR.q2, OPD_COLOR.q3, OPD_COLOR.q4]
      : byValue
        ? [RENT_COLOR.below, RENT_COLOR.above, RENT_COLOR.high]
        : [STATUS_COLOR.round, STATUS_COLOR.square, STATUS_COLOR.triangle];
  const measure = pinColors === "cpo" ? "CPO" : "Rent per m²";

  return (
    <div
      className={`map-legend absolute bg-[#111111]/90 backdrop-blur border border-[#333] rounded-lg shadow-2xl z-[500] ${open ? "open" : ""}`}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        className="legend-chip flex items-center gap-2 w-full text-left"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        title={open ? "Hide the legend" : "What the pins mean"}
      >
        <span className="flex items-center gap-[3px]" aria-hidden="true">
          {swatches.map((c) => (
            <Dot key={c} color={c} />
          ))}
        </span>
        <span className="text-[11px] text-gray-200 font-bold uppercase tracking-tight whitespace-nowrap">
          Legend · {{ status: "Status", rent: "Rent / m²", opd: "OPD", cpo: "CPO" }[pinColors]}
        </span>
        {notOnMap > 0 && !open && (
          <span className="text-[11px] text-[#FB923C] font-bold whitespace-nowrap" title="Stores without a pin">
            · {notOnMap} off map
          </span>
        )}
        <ChevronUp size={13} className={`ml-auto text-gray-400 transition-transform ${open ? "" : "rotate-180"}`} />
      </button>

      {open && (
        <div className="flex flex-wrap items-center map-legend-items">
          {pinColors === "opd" ? (
            <>
              {(["q1", "q2", "q3", "q4"] as const).map((q, i) => (
                <Item key={q} title="Orders per day, by quarter of the stores with an OPD">
                  <Dot color={OPD_COLOR[q]} /> {["Lowest", "Lower", "Higher", "Highest"][i]} OPD
                </Item>
              ))}
              <Item title="No OPD in the data">
                <Dot color={OPD_COLOR.none} /> No OPD
              </Item>
            </>
          ) : byValue ? (
            <>
              <Item title={`${measure} at or below the city median`}>
                <Dot color={RENT_COLOR.below} /> At or below median
              </Item>
              <Item title={`${measure} up to ${rentFlagPercent}% above the city median`}>
                <Dot color={RENT_COLOR.above} /> Up to {rentFlagPercent}% above
              </Item>
              <Item title={`${measure} more than ${rentFlagPercent}% above the city median`}>
                <Dot color={RENT_COLOR.high} /> Over {rentFlagPercent}% above
              </Item>
              <Item
                title={`No ${measure === "CPO" ? "CPO (OPD or rent missing)" : "rent per m²"}, or fewer than 3 stores with one in the city`}
              >
                <Dot color={RENT_COLOR.none} /> Not compared
              </Item>
            </>
          ) : null}
          {shapes.map((shape) => (
            <Item key={shape}>
              <Glyph shape={shape} color={byValue ? "#d4d4d4" : STATUS_COLOR[shape]} /> {SHAPE_LABEL[shape]}
            </Item>
          ))}
          <Item title="Zoomed out, stores are coloured dots (sized by rent); the status shapes show from street level">
            <span className="text-gray-400 normal-case font-semibold">Zoom in for the status shapes</span>
          </Item>
          {clusterStores && (
            <Item title="A cluster's ring is split in the colours of the stores inside, in their proportions. Hover for the numbers">
              <Donut colors={swatches} />
              <span className="normal-case font-semibold">Ring = mix of stores inside</span>
            </Item>
          )}
          <Item>
            <Dot color={PIN_SEL} /> Selected
          </Item>
          <Item title="Pins are small, medium or large by annual rent (lowest, middle and highest third of your stores)">
            <span className="text-gray-400 normal-case font-semibold">Bigger pin = higher rent</span>
          </Item>
          {potentials > 0 && (
            <div className="legend-potentials flex flex-wrap items-center" aria-label="Potentials">
              <span className="text-gray-400 text-[11px] font-bold uppercase tracking-tight">Potentials</span>
              {POTENTIAL_STATUSES.map((s) => (
                <Item key={s}>
                  <Glyph shape="potential" color={POTENTIAL_COLOR[s]} /> {POTENTIAL_STATUS_LABEL[s]}
                </Item>
              ))}
            </div>
          )}
          {notOnMap > 0 && (
            <div
              className="flex items-center gap-2 text-[11px] text-[#FB923C] font-bold uppercase tracking-tight"
              title="Stores with missing or implausible coordinates. See the NO LOCATION tag in the list."
            >
              <span>{notOnMap} not on map</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
