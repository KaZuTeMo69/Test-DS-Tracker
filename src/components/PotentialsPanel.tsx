import { ChangeEvent, CSSProperties, useMemo, useRef, useState } from "react";
import { ClipboardCopy, Download, Plus, Search, Upload, X } from "lucide-react";
import { CURRENCY } from "../constants";
import {
  daysSince,
  Potential,
  POTENTIAL_COLOR,
  POTENTIAL_STATUS_LABEL,
  POTENTIAL_STATUSES,
  PotentialStatus,
  rentPerSqm,
} from "../lib/potentials";
import { PotentialsTab } from "../hooks/usePotentials";

interface PotentialsPanelProps {
  potentials: Potential[]; // the sheet's and the drafts
  draftIds: Set<string>; // added in the app, not in the sheet yet
  tab: PotentialsTab; // whether the spreadsheet has a Potentials tab
  onCopyDrafts: (drafts: Potential[]) => void; // every draft as rows for the tab
  selectedId: string | null;
  onSelect: (p: Potential) => void;
  onAdd: () => void; // starts placing a new one on the map
  showOnMap: boolean;
  showDropped: boolean;
  onShowOnMap: (on: boolean) => void;
  onShowDropped: (on: boolean) => void;
  onExportCsv: () => void;
  onExportKml: () => void;
  onImport: (file: File) => void;
}

const ORDER: Record<PotentialStatus, number> = { study: 0, approved: 1, backup: 2, dropped: 3 };

export function StatusBadge({ status }: { status: PotentialStatus }) {
  return (
    <span className={`potential-badge ${status}`} style={{ "--status": POTENTIAL_COLOR[status] } as CSSProperties}>
      {POTENTIAL_STATUS_LABEL[status]}
    </span>
  );
}

const ago = (days: number) => (days === 0 ? "today" : `${days}d`);

// Where the list comes from, by whether the spreadsheet has a Potentials tab
const SOURCE_NOTE: Record<PotentialsTab, string> = {
  found: "from the sheet",
  unknown: "Potentials tab not read yet",
  missing: "no Potentials tab in the sheet",
  none: "no sheet linked",
};

/**
 * The Potentials: how many at each status (each a filter), a search, and the list. A row selects the Potential
 * on the map and opens its card. Adding, the map toggles, and CSV / KML export and import are here too.
 */
export default function PotentialsPanel({
  potentials,
  draftIds,
  tab,
  onCopyDrafts,
  selectedId,
  onSelect,
  onAdd,
  showOnMap,
  showDropped,
  onShowOnMap,
  onShowDropped,
  onExportCsv,
  onExportKml,
  onImport,
}: PotentialsPanelProps) {
  const [status, setStatus] = useState<PotentialStatus | null>(null);
  const [query, setQuery] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const now = useMemo(() => new Date(), []);

  const counts = useMemo(() => {
    const c: Record<PotentialStatus, number> = { study: 0, approved: 0, backup: 0, dropped: 0 };
    for (const p of potentials) c[p.status]++;
    return c;
  }, [potentials]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return potentials
      .filter((p) => (status ? p.status === status : true))
      .filter((p) => !q || [p.name, p.city, p.district, p.id].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.createdAt.localeCompare(a.createdAt));
  }, [potentials, status, query]);

  const drafts = useMemo(() => potentials.filter((p) => draftIds.has(p.id)), [potentials, draftIds]);
  const fromSheet = potentials.length - drafts.length;

  const pickFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImport(file);
    e.target.value = "";
  };

  return (
    <div className="potentials-panel flex flex-col gap-3">
      <button className="btn-primary potentials-add" onClick={onAdd}>
        <Plus size={15} /> Add potential
      </button>

      <div className="potential-counts" role="group" aria-label="Filter by status">
        {POTENTIAL_STATUSES.map((s) => (
          <button
            key={s}
            className={`potential-count ${status === s ? "on" : ""}`}
            style={{ "--status": POTENTIAL_COLOR[s] } as CSSProperties}
            aria-pressed={status === s}
            onClick={() => setStatus(status === s ? null : s)}
            title={status === s ? "Show all statuses" : `Only ${POTENTIAL_STATUS_LABEL[s]}`}
          >
            <span className="potential-count-n">{counts[s]}</span>
            <span className="potential-count-label">{POTENTIAL_STATUS_LABEL[s]}</span>
          </button>
        ))}
      </div>

      <label className="potentials-search">
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, city, district"
          aria-label="Search potentials"
        />
        {query && (
          <button onClick={() => setQuery("")} aria-label="Clear the search" title="Clear">
            <X size={13} />
          </button>
        )}
      </label>

      <div className="potentials-source" data-potentials-source={tab}>
        <span className="potentials-source-text">
          {tab === "found" ? (
            <>
              <b>{fromSheet}</b> {SOURCE_NOTE.found}
            </>
          ) : (
            SOURCE_NOTE[tab]
          )}
          {" · "}
          <b>{drafts.length}</b> {drafts.length === 1 ? "draft" : "drafts"}
        </span>
        <button
          className="layer-action"
          onClick={() => onCopyDrafts(drafts)}
          disabled={!drafts.length}
          title="Every draft as a tab-separated row, to paste into the Potentials tab"
        >
          <ClipboardCopy size={13} /> Copy all drafts
        </button>
      </div>

      <div className="potentials-toggles">
        <label className="settings-row settings-toggle-row">
          <input
            type="checkbox"
            role="switch"
            className="settings-switch"
            checked={showOnMap}
            onChange={(e) => onShowOnMap(e.target.checked)}
          />
          <span>Show on map</span>
        </label>
        <label className={`settings-row settings-toggle-row ${showOnMap ? "" : "opacity-50"}`}>
          <input
            type="checkbox"
            role="switch"
            className="settings-switch"
            checked={showDropped}
            disabled={!showOnMap}
            onChange={(e) => onShowDropped(e.target.checked)}
          />
          <span>Show dropped</span>
        </label>
      </div>

      {shown.length ? (
        <ul className="potentials-list">
          {shown.map((p) => {
            const rate = rentPerSqm(p);
            return (
              <li key={p.id}>
                <button
                  className={`potential-row ${selectedId === p.id ? "on" : ""}`}
                  onClick={() => onSelect(p)}
                  aria-current={selectedId === p.id}
                >
                  <span className="potential-row-top">
                    <span className="potential-row-name" title={p.name}>
                      {p.name}
                    </span>
                    {draftIds.has(p.id) && (
                      <span className="potential-row-draft" title="Draft — not in sheet yet">
                        Draft
                      </span>
                    )}
                    <StatusBadge status={p.status} />
                  </span>
                  <span className="potential-row-meta">
                    <span className="truncate">{[p.district, p.city].filter(Boolean).join(", ") || "No city"}</span>
                    <span className="potential-row-rent">
                      {rate !== null ? `${CURRENCY} ${Math.round(rate).toLocaleString()}/m²` : "No rent/m²"}
                    </span>
                    {p.createdAt && (
                      <span className="potential-row-age" title={`Added ${new Date(p.createdAt).toLocaleDateString()}`}>
                        {ago(daysSince(p.createdAt, now))}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="nearby-empty potentials-empty">
          {potentials.length
            ? "No potentials match."
            : "No potentials yet. Add one here, or search a coordinate and choose Add potential."}
        </p>
      )}

      <div className="potentials-files">
        <button className="layer-action" onClick={onExportCsv} disabled={!potentials.length} title="Save as CSV">
          <Download size={13} /> CSV
        </button>
        <button className="layer-action" onClick={onExportKml} disabled={!potentials.length} title="Save as KML">
          <Download size={13} /> KML
        </button>
        <button className="layer-action" onClick={() => fileRef.current?.click()} title="Add from a CSV or JSON file">
          <Upload size={13} /> Import
        </button>
        <input ref={fileRef} type="file" accept=".csv,.json,.txt" hidden onChange={pickFile} />
      </div>
    </div>
  );
}
