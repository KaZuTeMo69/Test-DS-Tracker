import { CSSProperties, KeyboardEvent, ReactNode, useMemo, useState } from "react";
import { Check, Copy, ExternalLink, MapPin, Pencil, X } from "lucide-react";
import CardFrame from "./CardFrame";
import ConfirmButton from "./ConfirmButton";
import NearbyStores from "./NearbyStores";
import { StatusBadge } from "./PotentialsPanel";
import MapsButtons from "./MapsButtons";
import { copyText } from "../lib/clipboard";
import { Store, ZoneLayer } from "../types";
import { CURRENCY } from "../constants";
import { useSettings } from "../hooks/useSettings";
import {
  daysSince,
  isWebLink,
  Potential,
  POTENTIAL_COLOR,
  POTENTIAL_STATUS_LABEL,
  POTENTIAL_STATUSES,
  PotentialDraft,
  PotentialStatus,
  rentPerSqm,
  storeRowTsv,
  zonesAt,
} from "../lib/potentials";
import { CityMedian, compareToMedian } from "../lib/rentStats";
import { rentFactor, shownRent, vatLabel } from "../lib/settings";
import { potentialTargets } from "../lib/cpo";
import { ZoneHit } from "../lib/coverage";

interface PotentialCardProps {
  potential: Potential;
  stores: Store[]; // all stores: the nearest live ones
  layers: ZoneLayer[];
  cityMedian: CityMedian | undefined; // the city's median store rent per m²
  storeHeaders: string[] | null; // the loaded sheet's columns, for Copy as store row
  onEdit: (patch: Partial<PotentialDraft>) => void;
  onStatus: (status: PotentialStatus, dropReason?: string) => void;
  onMove: () => void; // opens the form, to move the pin
  onDelete: () => void;
  onSelectStore: (id: number) => void;
  onSelectZone: (layerId: string, zoneId: string) => void;
  onCopied: (what: string) => void;
  onClose: () => void;
  onInset?: (px: number) => void;
}

type Tab = "study" | "details";

const sar = (n: number | null) => (n === null ? "—" : `${CURRENCY} ${Math.round(n).toLocaleString()}`);

/**
 * A field shown as text; clicked (or Enter on it) it becomes an input. Enter or leaving it saves, Esc cancels.
 * Required fields can't be saved empty.
 */
function EditableRow({
  label,
  value,
  display,
  kind = "text",
  required = false,
  placeholder = "Add",
  onSave,
  check,
}: {
  label: string;
  value: string;
  display?: ReactNode;
  kind?: "text" | "number" | "multiline" | "url";
  required?: boolean;
  placeholder?: string;
  onSave: (text: string) => void;
  check?: (text: string) => string | null; // an error to show, or null
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const editing = draft !== null;
  const id = `pc-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`;

  const save = () => {
    if (draft === null) return;
    const text = draft.trim();
    const problem = required && !text ? `${label} can't be empty` : (check?.(text) ?? null);
    if (problem) {
      setError(problem);
      return;
    }
    if (text !== value.trim()) onSave(text);
    setDraft(null);
    setError(null);
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    e.stopPropagation();
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
    } else if (e.key === "Enter" && (kind !== "multiline" || e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  };

  return (
    <div className={`pc-row ${editing ? "editing" : ""}`}>
      <label className="detail-panel-row-label text-[11px] pc-row-label" htmlFor={id}>
        {label}
      </label>
      {editing ? (
        <div className="pc-edit">
          {kind === "multiline" ? (
            <textarea
              id={id}
              className={`pf-input pf-textarea ${error ? "invalid" : ""}`}
              value={draft}
              autoFocus
              rows={3}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onBlur={save}
            />
          ) : (
            <input
              id={id}
              className={`pf-input ${error ? "invalid" : ""}`}
              value={draft}
              autoFocus
              inputMode={kind === "number" ? "decimal" : kind === "url" ? "url" : undefined}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKey}
              onBlur={save}
              aria-invalid={!!error}
            />
          )}
          {error && (
            <p className="pf-error" role="alert">
              {error}
            </p>
          )}
        </div>
      ) : (
        <button
          id={id}
          className={`pc-value ${value ? "" : "empty"}`}
          onClick={() => setDraft(value)}
          title={`Edit ${label.toLowerCase()}`}
        >
          <span className="pc-value-text">{value ? (display ?? value) : placeholder}</span>
          <Pencil size={12} className="pc-pencil" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

const numberText = (n: number | null) => (n === null ? "" : String(n));
const toNumber = (text: string) => {
  const n = Number(text.replace(/,/g, ""));
  return text === "" ? null : Number.isFinite(n) && n >= 0 ? n : NaN;
};
const numberCheck = (text: string) => (Number.isNaN(toNumber(text)) ? "Type a number" : null);

// The status control; Dropped asks for the reason first
function StatusControl({
  status,
  onStatus,
}: {
  status: PotentialStatus;
  onStatus: (status: PotentialStatus, dropReason?: string) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [reason, setReason] = useState("");
  const [tried, setTried] = useState(false);
  const drop = () => {
    setTried(true);
    if (!reason.trim()) return;
    onStatus("dropped", reason.trim());
    setAsking(false);
    setReason("");
    setTried(false);
  };
  return (
    <div className="pc-status">
      <div className="pf-seg" role="radiogroup" aria-label="Status">
        {POTENTIAL_STATUSES.map((s) => (
          <button
            key={s}
            role="radio"
            aria-checked={status === s}
            className={`pf-seg-btn ${status === s ? "on" : ""} ${asking && s === "dropped" ? "asking" : ""}`}
            style={{ "--status": POTENTIAL_COLOR[s] } as CSSProperties}
            onClick={() => {
              if (s === status) return;
              if (s === "dropped") setAsking(true);
              else {
                setAsking(false);
                onStatus(s);
              }
            }}
          >
            {POTENTIAL_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      {asking && (
        <div className="pc-drop">
          <label className="pf-label" htmlFor="pc-drop-reason">
            Why is it dropped? *
          </label>
          <input
            id="pc-drop-reason"
            className={`pf-input ${tried && !reason.trim() ? "invalid" : ""}`}
            value={reason}
            autoFocus
            placeholder="e.g. Landlord withdrew, too small"
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") drop();
              if (e.key === "Escape") {
                e.preventDefault();
                setAsking(false);
              }
            }}
          />
          {tried && !reason.trim() && (
            <p className="pf-error" role="alert">
              A reason is needed to drop it
            </p>
          )}
          <div className="pc-drop-actions">
            <button className="layer-action" onClick={() => setAsking(false)}>
              <X size={13} /> Cancel
            </button>
            <button className="zone-card-btn primary" onClick={drop}>
              <Check size={13} /> Drop it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// The asking rent against the target CPO (Settings): the estimated CPO, the OPD needed, the most rent to pay
function CpoStudy({ potential: p }: { potential: Potential }) {
  const settings = useSettings();
  const { targetCpo } = settings;
  const t = potentialTargets(p.askingRentAnnual, p.expectedOpd, targetCpo);
  const factor = rentFactor(settings.includeVat);
  const money = (n: number) => `${CURRENCY} ${(n * factor).toFixed(2)}`;
  const over = t.estimatedCpo !== null && targetCpo ? t.estimatedCpo > targetCpo : null;
  return (
    <div className="pc-rent pc-cpo" data-cpo-study>
      <div className="pc-cpo-row">
        <span className="pc-figure-label">Estimated CPO</span>
        <span className={`pc-cpo-value ${over === null ? "" : over ? "bad" : "good"}`}>
          {t.estimatedCpo === null ? "—" : money(t.estimatedCpo)}
          {over !== null && <small>{over ? " above target" : " within target"}</small>}
        </span>
      </div>
      <div className="pc-cpo-row">
        <span className="pc-figure-label">OPD needed for the target</span>
        <span className="pc-cpo-value">{t.minOpd === null ? "—" : Math.ceil(t.minOpd).toLocaleString()}</span>
      </div>
      <div className="pc-cpo-row">
        <span className="pc-figure-label">Most rent / yr at the expected OPD</span>
        <span className="pc-cpo-value">
          {t.maxRent === null ? "—" : `${CURRENCY} ${Math.floor(t.maxRent * factor).toLocaleString()}`}
        </span>
      </div>
      <p className="pc-cpo-note">
        {!targetCpo
          ? "Set a target CPO in Settings to see the OPD needed and the most rent to pay."
          : `Target ${money(targetCpo)} per order.`}
        {p.expectedOpd === null && " Add the expected OPD in Details for the estimate."}
        {p.askingRentAnnual === null && " Add the asking rent in Details."}
      </p>
    </div>
  );
}

function ZoneRow({ hit, onSelect }: { hit: ZoneHit; onSelect: (layerId: string, zoneId: string) => void }) {
  return (
    <button
      onClick={() => onSelect(hit.layerId, hit.zoneId)}
      className="store-card-zone flex items-center gap-2 w-full text-left rounded-md"
      title="Open this zone"
    >
      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: hit.color }} />
      <span className="text-[12px] font-bold text-white truncate">{hit.zoneName}</span>
      <span className="text-[11px] text-gray-400 truncate ml-auto shrink-0 max-w-[45%]">{hit.layerName}</span>
    </button>
  );
}

// What's worked out for the site: rent against the city, the zones it's in, and the nearest stores by drive time
function StudyTab({
  potential: p,
  stores,
  layers,
  cityMedian,
  onSelectStore,
  onSelectZone,
}: Pick<PotentialCardProps, "potential" | "stores" | "layers" | "cityMedian" | "onSelectStore" | "onSelectZone">) {
  const settings = useSettings();
  const rate = rentPerSqm(p);
  const vs = compareToMedian(rate, cityMedian, settings.rentFlagPercent);
  const zones = useMemo(() => zonesAt(p.lat, p.lng, layers), [p.lat, p.lng, layers]);
  const tone = vs.level === "high" ? "bad" : vs.level === "above" ? "warn" : vs.level === "below" ? "good" : "none";
  const city = p.city || "the city";
  const vat = vatLabel(settings);

  return (
    <>
      <div className="pc-section-label detail-panel-row-label text-[11px]">Rent</div>
      <div className="pc-rent">
        <div>
          <div className="pc-figure">{rate !== null ? sar(shownRent(rate, settings)) : "—"}</div>
          <div className="pc-figure-label">asking per m² a year {vat}</div>
        </div>
        <div className={`pc-vs ${tone}`} data-level={vs.level}>
          {vs.diff !== null ? (
            <>
              <b>
                {vs.diff === 0 ? "Same as" : `${vs.diff > 0 ? "+" : ""}${vs.diff}%`}
                {vs.diff === 0 ? "" : " vs"}
              </b>{" "}
              the {city} median ({sar(shownRent(vs.median, settings))})
            </>
          ) : rate === null ? (
            "Add the size and asking rent to compare with the city"
          ) : (
            `${city} needs 3 stores with rent and area for a median`
          )}
        </div>
      </div>

      <div className="pc-section-label detail-panel-row-label text-[11px]">Coverage</div>
      {!zones.hasCoverage && !zones.hasWhiteSpace ? (
        <p className="nearby-empty">No coverage or white-space layers on the map.</p>
      ) : (
        <div className="flex flex-col gap-1">
          {zones.hasCoverage && !zones.coverage.length && (
            <p className="pc-flag warn">Not in any coverage zone on the map</p>
          )}
          {zones.whiteSpace.length > 0 && (
            <p className="pc-flag good">Inside white space: an area with no coverage yet</p>
          )}
          {[...zones.coverage, ...zones.whiteSpace].map((hit) => (
            <ZoneRow key={hit.zoneId} hit={hit} onSelect={onSelectZone} />
          ))}
        </div>
      )}

      <div className="pc-section-label detail-panel-row-label text-[11px]">Cost per order {vat}</div>
      <CpoStudy potential={p} />

      <div className="pc-section-label detail-panel-row-label text-[11px]">Nearest live stores</div>
      <NearbyStores point={{ lat: p.lat, lng: p.lng }} stores={stores} onSelect={onSelectStore} pointName={p.name} />
    </>
  );
}

function DetailsTab({ potential: p, onEdit }: Pick<PotentialCardProps, "potential" | "onEdit">) {
  const settings = useSettings();
  const now = useMemo(() => new Date(), []);
  const days = daysSince(p.createdAt, now);
  return (
    <>
      <EditableRow label="Name" value={p.name} required onSave={(name) => onEdit({ name })} />
      <EditableRow label="City" value={p.city} required onSave={(city) => onEdit({ city })} />
      <EditableRow label="District" value={p.district} onSave={(district) => onEdit({ district })} />
      <EditableRow
        label="Size (m²)"
        value={numberText(p.size)}
        kind="number"
        display={p.size !== null ? `${p.size.toLocaleString()} m²` : undefined}
        check={numberCheck}
        onSave={(t) => onEdit({ size: toNumber(t) })}
      />
      <EditableRow
        label={`Asking rent / yr ${vatLabel(settings)}`.trim()}
        value={numberText(p.askingRentAnnual)}
        kind="number"
        display={p.askingRentAnnual !== null ? sar(shownRent(p.askingRentAnnual, settings)) : undefined}
        check={numberCheck}
        onSave={(t) => onEdit({ askingRentAnnual: toNumber(t) })}
      />
      <EditableRow
        label="Expected OPD"
        value={numberText(p.expectedOpd)}
        kind="number"
        display={p.expectedOpd !== null ? `${p.expectedOpd.toLocaleString()} orders / day` : undefined}
        check={numberCheck}
        onSave={(t) => onEdit({ expectedOpd: toNumber(t) })}
      />
      <EditableRow label="Contact" value={p.contact} onSave={(contact) => onEdit({ contact })} />
      <EditableRow label="Notes" value={p.notes} kind="multiline" onSave={(notes) => onEdit({ notes })} />
      <EditableRow
        label="Feasibility link"
        value={p.feasibilityLink}
        kind="url"
        display={
          p.feasibilityLink ? (
            <a
              href={p.feasibilityLink}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="pc-link"
            >
              Open the study <ExternalLink size={11} />
            </a>
          ) : undefined
        }
        check={(t) => (t && !isWebLink(t) ? "Paste a full link, starting with https://" : null)}
        onSave={(feasibilityLink) => onEdit({ feasibilityLink })}
      />
      {p.status === "dropped" && (
        <EditableRow
          label="Drop reason"
          value={p.dropReason}
          required
          onSave={(dropReason) => onEdit({ dropReason })}
        />
      )}
      <EditableRow label="Added by" value={p.addedBy} onSave={(addedBy) => onEdit({ addedBy })} />
      <div className="pc-meta">
        <span>
          Added {new Date(p.createdAt).toLocaleDateString()} ({days === 0 ? "today" : `${days} days ago`})
        </span>
        <span>
          {POTENTIAL_STATUS_LABEL[p.status]} since {new Date(p.statusChangedAt).toLocaleDateString()}
        </span>
        <span className="font-mono">
          {p.lat.toFixed(6)}, {p.lng.toFixed(6)}
        </span>
      </div>
    </>
  );
}

/** A Potential's card: its status, the study worked out for it, its details (edited in place) and actions. */
export default function PotentialCard(props: PotentialCardProps) {
  const { potential: p, storeHeaders, onStatus, onMove, onDelete, onCopied, onClose, onInset } = props;
  const [tab, setTab] = useState<Tab>("study");

  const copyRow = async () => {
    if (await copyText(storeRowTsv(p, storeHeaders))) onCopied("Store row copied. Paste it into the store sheet");
    else onCopied("Couldn't copy. Your browser blocked the clipboard");
  };

  return (
    <CardFrame width={360} label={`Potential: ${p.name}`} onClose={onClose} onInset={onInset}>
      <div className="store-card-header border-b border-[#262626]" data-sheet-header data-sheet-drag>
        <div className="flex justify-between items-start gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="detail-panel-title text-[18px] text-white leading-tight truncate" title={p.name}>
              {p.name}
            </h3>
            <p className="detail-panel-subtext text-[11px] store-card-gap-top">
              {p.id} · {[p.district, p.city].filter(Boolean).join(", ") || "No city"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-full bg-white/5 text-gray-400 hover:text-white transition-colors cursor-pointer"
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5 store-card-chips items-center">
          <span className="potential-kind">Potential</span>
          <StatusBadge status={p.status} />
        </div>
        <StatusControl key={p.status} status={p.status} onStatus={onStatus} />
      </div>

      <div className="tab-container store-card-tabs pc-tabs">
        {(
          [
            ["study", "Study"],
            ["details", "Details"],
          ] as [Tab, string][]
        ).map(([id, text]) => (
          <button key={id} className={`tab-btn ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
            {text}
          </button>
        ))}
      </div>

      <div className="store-card-body flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-0">
        {tab === "study" ? (
          <StudyTab {...props} />
        ) : (
          <>
            <DetailsTab potential={p} onEdit={props.onEdit} />
            <div className="pc-actions">
              <button className="pc-action" onClick={onMove} title="Edit every field, or move the pin">
                <MapPin size={13} /> Edit / move pin
              </button>
              <ConfirmButton
                label="Delete"
                confirmLabel="Click again to delete"
                onConfirm={onDelete}
                className="pc-action danger"
                title="Delete this potential"
              />
            </div>
          </>
        )}
      </div>

      <div className="store-card-footer pc-footer">
        <MapsButtons point={{ lat: p.lat, lng: p.lng }} label={p.name} />
        {p.status === "approved" && (
          <button className="pc-action" onClick={copyRow} title="A tab-separated row in the store sheet's column order">
            <Copy size={13} /> Copy as store row
          </button>
        )}
      </div>
    </CardFrame>
  );
}
