import { ReactNode } from "react";
import { PIN_SEL } from "../constants";
import { useSettings } from "../hooks/useSettings";
import { PinColors } from "../lib/settings";
import { PIN_PATH, PinShape, RENT_COLOR, STATUS_COLOR } from "./map/pinIcon";

const SHAPE_LABEL: Record<PinShape, string> = { round: "Live · Paid", square: "Live · Unpaid", diamond: "Not live" };

// A small pin in the legend, drawn like the ones on the map
function Glyph({ shape, color }: { shape: PinShape; color: string }) {
  return (
    <svg width="10" height="13" viewBox="0 0 24 32" aria-hidden="true" className="shrink-0">
      <path d={PIN_PATH[shape]} fill={color} />
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

/**
 * What the pins mean: the shape is the status and the size the annual rent; the colour is the status or rent per
 * m² against the city median, chosen here. Also how many of the listed stores have no pin.
 */
export default function MapLegend({
  notOnMap,
  onPinColors,
}: {
  notOnMap: number;
  onPinColors: (pinColors: PinColors) => void;
}) {
  const { pinColors, rentFlagPercent } = useSettings();
  const byRent = pinColors === "rent";
  const shapes: PinShape[] = ["round", "square", "diamond"];

  return (
    <div className="map-legend absolute bottom-4 left-4 bg-[#111111]/90 backdrop-blur border border-[#333] rounded-lg shadow-2xl z-[500]">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-tight">Colour</span>
        <div className="frow grid grid-cols-2 gap-1 map-legend-toggle">
          {(
            [
              ["status", "Status"],
              ["rent", "Rent / m²"],
            ] as [PinColors, string][]
          ).map(([mode, text]) => (
            <button
              key={mode}
              onClick={() => onPinColors(mode)}
              className={`fb ${pinColors === mode ? "on" : ""}`}
              title={
                mode === "rent"
                  ? "Colour pins by rent per m² against the median of their city"
                  : "Colour pins by Live / Paid status"
              }
            >
              {text}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center map-legend-items">
        {byRent ? (
          <>
            <Item title="Rent per m² at or below the city median">
              <Dot color={RENT_COLOR.below} /> At or below median
            </Item>
            <Item title={`Up to ${rentFlagPercent}% above the city median`}>
              <Dot color={RENT_COLOR.above} /> Up to {rentFlagPercent}% above
            </Item>
            <Item title={`More than ${rentFlagPercent}% above the city median (HIGH RENT)`}>
              <Dot color={RENT_COLOR.high} /> Over {rentFlagPercent}% above
            </Item>
            <Item title="No rent per m², or fewer than 3 stores with one in the city">
              <Dot color={RENT_COLOR.none} /> Not compared
            </Item>
          </>
        ) : null}
        {shapes.map((shape) => (
          <Item key={shape}>
            <Glyph shape={shape} color={byRent ? "#d4d4d4" : STATUS_COLOR[shape]} /> {SHAPE_LABEL[shape]}
          </Item>
        ))}
        <Item>
          <Dot color={PIN_SEL} /> Selected
        </Item>
        <Item title="Pins are small, medium or large by annual rent (lowest, middle and highest third of your stores)">
          <span className="text-gray-400 normal-case font-semibold">Bigger pin = higher rent</span>
        </Item>
        {notOnMap > 0 && (
          <div
            className="flex items-center gap-2 text-[11px] text-[#FB923C] font-bold uppercase tracking-tight"
            title="Stores with missing or implausible coordinates. See the NO LOCATION tag in the list."
          >
            <span>{notOnMap} not on map</span>
          </div>
        )}
      </div>
    </div>
  );
}
