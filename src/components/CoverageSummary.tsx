import { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { CoverageFilter } from "../types";
import { COVERAGE_TAG } from "../constants";
import { Coverage, ZoneHit } from "../lib/coverage";

interface CoverageSummaryProps {
  coverage: Coverage;
  storeCount: number;
  zoneCount: number; // zones in all layers, shown or hidden
  onShowStores: (filter: CoverageFilter) => void;
  onSelectZone: (layerId: string, zoneId: string) => void;
  onOpenLayers: () => void;
}

const plural = (n: number, one: string, many: string) => `${n.toLocaleString()} ${n === 1 ? one : many}`;

const formatArea = (km2: number) => (km2 < 10 ? `${km2.toFixed(2)} km²` : `${Math.round(km2).toLocaleString()} km²`);

function Tile({
  label,
  value,
  note,
  valueClass = "",
}: {
  label: string;
  value: ReactNode;
  note?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white/[0.03] border border-white/10 rounded-lg store-card-box min-w-0">
      <div className="detail-panel-row-label text-[11px]">{label}</div>
      <div className={`detail-panel-figure text-[20px] leading-tight store-card-gap-top ${valueClass}`}>{value}</div>
      {note && <div className="text-[11px] text-gray-400 store-card-gap-top">{note}</div>}
    </div>
  );
}

// A count of flagged stores; with any, a click shows just those stores in the list and on the map
function StoresRow({
  count,
  filter,
  text,
  noneText,
  onShow,
}: {
  count: number;
  filter: CoverageFilter;
  text: string;
  noneText: string;
  onShow: (filter: CoverageFilter) => void;
}) {
  if (count === 0) return <div className="coverage-link coverage-link-ok text-green-400">✓ {noneText}</div>;
  return (
    <button onClick={() => onShow(filter)} className={`coverage-link border ${COVERAGE_TAG[filter].className}`}>
      <span>
        <b>{count.toLocaleString()}</b> {text}
      </span>
      <span className="flex items-center gap-1 text-[11px] font-bold shrink-0">
        View stores <ChevronRight size={13} />
      </span>
    </button>
  );
}

function ZoneList({
  title,
  zones,
  detail,
  onSelect,
}: {
  title: string;
  zones: ZoneHit[];
  detail?: (hit: ZoneHit) => string;
  onSelect: (layerId: string, zoneId: string) => void;
}) {
  if (!zones.length) return null;
  return (
    <details className="layer-zones">
      <summary className="text-[11.5px] text-gray-300 cursor-pointer">
        {title} ({zones.length})
      </summary>
      <div className="flex flex-col layer-zone-list">
        {zones.map((hit) => (
          <button
            key={hit.zoneId}
            onClick={() => onSelect(hit.layerId, hit.zoneId)}
            className="layer-zone flex items-center gap-2 text-left text-[12px] rounded-md"
            title={`${hit.layerName}: open this zone`}
          >
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: hit.color }} />
            <span className="truncate">{hit.zoneName}</span>
            {detail && <span className="text-[11px] text-gray-400 ml-auto shrink-0">{detail(hit)}</span>}
          </button>
        ))}
      </div>
    </details>
  );
}

/** The Growth tab's Coverage section: how the stores sit against the coverage and white-space zones on the map. */
export default function CoverageSummary({
  coverage,
  storeCount,
  zoneCount,
  onShowStores,
  onSelectZone,
  onOpenLayers,
}: CoverageSummaryProps) {
  const { hasCoverage, hasWhiteSpace, coverageZones, whiteSpaceZones, unserved, overlapping } = coverage;
  const storesIn = (hit: ZoneHit) => coverage.storesIn.get(hit.zoneId)?.length ?? 0;

  return (
    <section className="coverage-summary">
      <h3 className="coverage-heading text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Coverage</h3>

      {!hasCoverage && !hasWhiteSpace ? (
        <div className="bg-white/[0.03] border border-white/10 rounded-lg store-card-box text-[12px] text-gray-300 leading-relaxed">
          {zoneCount
            ? "All map layers are hidden. Show a layer to check your stores against its zones."
            : "No zones yet. Import your KML files or draw zones, and each store is checked against them."}
          <button onClick={onOpenLayers} className="layer-action coverage-open-layers">
            Open Layers <ChevronRight size={13} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {hasCoverage ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Tile label="Coverage zones" value={coverageZones.length.toLocaleString()} />
                <Tile
                  label="Served"
                  value={(coverageZones.length - unserved.length).toLocaleString()}
                  note={`of ${coverageZones.length.toLocaleString()} have a store inside`}
                />
                <Tile
                  label="Unserved"
                  value={unserved.length.toLocaleString()}
                  note="zones with no store"
                  valueClass={unserved.length ? "text-red-400" : ""}
                />
                <Tile
                  label="Overlap"
                  value={overlapping.length.toLocaleString()}
                  note="zones with 2 or more stores"
                  valueClass={overlapping.length ? "text-[#fbbf24]" : ""}
                />
              </div>
              <StoresRow
                count={coverage.outside.length}
                filter="outside"
                text={`${coverage.outside.length === 1 ? "store is" : "stores are"} outside every coverage zone`}
                noneText="Every store is inside a coverage zone"
                onShow={onShowStores}
              />
            </>
          ) : (
            <div className="text-[11.5px] text-gray-400 leading-relaxed">
              No coverage layer is on the map, so no store is checked for coverage. Mark a layer as Coverage in the
              Layers tab.
            </div>
          )}

          {hasWhiteSpace && (
            <>
              <Tile
                label="White space"
                value={formatArea(coverage.whiteSpaceKm2)}
                note={`in ${plural(whiteSpaceZones.length, "zone", "zones")}`}
              />
              <StoresRow
                count={coverage.inWhiteSpace.length}
                filter="whitespace"
                text={`${coverage.inWhiteSpace.length === 1 ? "store is" : "stores are"} inside white space`}
                noneText="No store is inside white space"
                onShow={onShowStores}
              />
            </>
          )}

          <ZoneList title="Unserved zones" zones={unserved} onSelect={onSelectZone} />
          <ZoneList
            title="Zones with 2 or more stores"
            zones={overlapping}
            detail={(hit) => plural(storesIn(hit), "store", "stores")}
            onSelect={onSelectZone}
          />

          <div className="text-[11px] text-gray-400 leading-relaxed coverage-note">
            Checks all {plural(storeCount, "store", "stores")}, live or not, against the layers shown on the map.
            {coverage.unchecked.length > 0 &&
              ` ${plural(coverage.unchecked.length, "store has", "stores have")} no location and ${coverage.unchecked.length === 1 ? "wasn't" : "weren't"} checked.`}
          </div>
        </div>
      )}
    </section>
  );
}
