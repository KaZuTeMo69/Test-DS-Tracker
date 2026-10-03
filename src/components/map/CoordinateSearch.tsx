import { FormEvent, useState } from "react";
import { Search, X } from "lucide-react";
import { LatLng, parseCoordinateInput } from "../../lib/coords";

interface CoordinateSearchProps {
  value: string;
  onChange: (value: string) => void;
  onFound: (point: LatLng) => void;
  onClear: () => void;
  // From 768 to 1280px the bar would sit on top of the open store card, so it steps aside while one is open (on a
  // phone the card is a sheet at the bottom, out of its way)
  stepAside: boolean;
  autoFocus?: boolean; // just opened from the top bar
}

/** The floating search bar that drops a pin at a typed coordinate. */
export default function CoordinateSearch({
  value,
  onChange,
  onFound,
  onClear,
  stepAside,
  autoFocus,
}: CoordinateSearchProps) {
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const result = parseCoordinateInput(value);
    if (!result) return;
    if ("error" in result) setError(result.error);
    else onFound(result.point);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- only keeps clicks and keys inside the search from reaching the map and the page
    <div
      className={`coord-search absolute top-4 left-1/2 -translate-x-1/2 sm:w-[340px] w-[220px] max-w-[90vw] z-[1000] pointer-events-auto transition-all duration-300 ${stepAside ? "md:max-xl:hidden" : ""}`}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <form onSubmit={submit} className="flex flex-col gap-1.5">
        <div className="flex items-center bg-[#111111]/90 backdrop-blur-md border border-[#333] hover:border-gray-500 rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.5)] transition-all overflow-hidden">
          <Search size={15} className="text-gray-400 mr-1.5 sm:mr-2 shrink-0" />
          <input
            type="text"
            placeholder="Search coordinates..."
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (error) setError("");
            }}
            className="flex-1 bg-transparent text-[11px] sm:text-xs text-white border-none outline-none font-sans placeholder:text-gray-400 pr-1.5 sm:pr-2 h-7 sm:h-8 min-w-0"
            title="Enter Lat, Lng coordinates, e.g., 24.7136, 46.6753"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setError("");
                onClear();
              }}
              className="p-1 text-gray-400 hover:text-white transition-colors cursor-pointer shrink-0"
            >
              <X size={13} />
            </button>
          )}
          <button
            type="submit"
            className="bg-[#fbbf24] hover:opacity-90 text-black text-[11px] font-black uppercase tracking-wider px-2 sm:px-3.5 py-1 sm:py-1.5 rounded-lg ml-0.5 sm:ml-1 shrink-0 cursor-pointer active:scale-95 transition-transform"
          >
            Go
          </button>
        </div>
        {error && (
          <div className="text-[11px] font-bold text-red-500 whitespace-nowrap bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg text-center shadow-lg duration-200">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
