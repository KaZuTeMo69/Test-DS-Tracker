import { CSSProperties, FormEvent, KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Diamond, X } from "lucide-react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { parseCoordinateInput } from "../lib/coords";
import { CURRENCY } from "../constants";
import {
  checkPotential,
  POTENTIAL_COLOR,
  POTENTIAL_STATUS_LABEL,
  POTENTIAL_STATUSES,
  PotentialDraft,
  PotentialErrors,
  rentPerSqm,
} from "../lib/potentials";

interface PotentialFormProps {
  mode: "add" | "edit";
  draft: PotentialDraft;
  cities: string[]; // suggestions for the city
  onChange: (patch: Partial<PotentialDraft>) => void;
  onSave: () => void;
  onCancel: () => void;
}

const numberOrNull = (text: string) => {
  const n = Number(text.replace(/,/g, "").trim());
  return text.trim() === "" || !Number.isFinite(n) || n < 0 ? null : n;
};

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="pf-field">
      <label className="pf-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {error ? (
        <p className="pf-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : (
        hint && <p className="pf-hint">{hint}</p>
      )}
    </div>
  );
}

/**
 * Adding or editing a Potential. It sits beside the map (a sheet at the bottom on a phone) rather than over it, so
 * the pin can still be dragged, or the map clicked, to correct the spot. Name and city are required; the rest is
 * under "More details". Enter saves (Ctrl+Enter in the notes), Esc cancels, and Tab stays inside.
 */
export default function PotentialForm({ mode, draft, cities, onChange, onSave, onCancel }: PotentialFormProps) {
  const ref = useRef<HTMLFormElement>(null);
  useFocusTrap(ref);
  // Once Save has been tried, what's missing is said under its field
  const [tried, setTried] = useState(false);
  const [more, setMore] = useState(mode === "edit");
  // The location as typed; the pin follows once it reads as coordinates
  const [coordsText, setCoordsText] = useState<string | null>(null);
  const errors: PotentialErrors = tried ? checkPotential(draft) : {};
  const coords = coordsText ?? `${draft.lat.toFixed(6)}, ${draft.lng.toFixed(6)}`;
  const coordsError =
    coordsText !== null && coordsText.trim() && !("point" in (parseCoordinateInput(coordsText) ?? {}))
      ? "Type it as lat, lng (for example 24.7612, 46.6021)"
      : undefined;
  const rate = rentPerSqm(draft);

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTried(true);
    const found = checkPotential(draft);
    if (Object.keys(found).length) {
      // The first field that needs something gets focus
      const first = (["name", "city", "dropReason", "feasibilityLink"] as const).find((k) => found[k]);
      if (first === "feasibilityLink") setMore(true);
      setTimeout(() => ref.current?.querySelector<HTMLElement>(`#pf-${first}`)?.focus(), 0);
      return;
    }
    onSave();
  };

  // Esc cancels also after a click on the map took focus out of the form (preventDefault tells the page it's used)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const onKeyDown = (e: KeyboardEvent<HTMLFormElement>) => {
    // Keys typed here stay here (not the map's, nor the page's F for focus mode); Esc is handled above
    if (e.key !== "Escape") e.stopPropagation();
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "TEXTAREA" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit();
    }
  };

  const invalid = (key: keyof PotentialErrors) =>
    errors[key] ? { "aria-invalid": true, "aria-describedby": `pf-${key}-error` } : {};

  return (
    <form
      ref={ref}
      data-modal
      role="dialog"
      aria-modal="true"
      aria-labelledby="pf-title"
      className="potential-form"
      onSubmit={submit}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      noValidate
    >
      <header className="pf-head">
        <span className="pf-icon" style={{ color: POTENTIAL_COLOR[draft.status] }} aria-hidden="true">
          <Diamond size={18} fill="currentColor" />
        </span>
        <div className="min-w-0">
          <h2 id="pf-title" className="modal-title">
            {mode === "add" ? "Add potential" : "Edit potential"}
          </h2>
          <p className="pf-sub">Drag the pin or click the map to move it</p>
        </div>
        <button type="button" onClick={onCancel} className="modal-close" title="Cancel (Esc)" aria-label="Cancel">
          <X size={16} />
        </button>
      </header>

      <div className="pf-body">
        <Field id="pf-name" label="Name *" error={errors.name}>
          <input
            id="pf-name"
            data-autofocus
            className={`pf-input ${errors.name ? "invalid" : ""}`}
            value={draft.name}
            onChange={(e) => onChange({ name: e.target.value })}
            placeholder="e.g. Hittin, Prince Turki Rd corner"
            autoComplete="off"
            {...invalid("name")}
          />
        </Field>
        <div className="pf-pair">
          <Field id="pf-city" label="City *" error={errors.city}>
            <input
              id="pf-city"
              className={`pf-input ${errors.city ? "invalid" : ""}`}
              value={draft.city}
              onChange={(e) => onChange({ city: e.target.value })}
              list="pf-cities"
              autoComplete="off"
              {...invalid("city")}
            />
            <datalist id="pf-cities">
              {cities.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field id="pf-district" label="District">
            <input
              id="pf-district"
              className="pf-input"
              value={draft.district}
              onChange={(e) => onChange({ district: e.target.value })}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="pf-field">
          <span className="pf-label" id="pf-status-label">
            Status
          </span>
          <div className="pf-seg" role="radiogroup" aria-labelledby="pf-status-label">
            {POTENTIAL_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={draft.status === s}
                className={`pf-seg-btn ${draft.status === s ? "on" : ""}`}
                style={{ "--status": POTENTIAL_COLOR[s] } as CSSProperties}
                onClick={() => onChange({ status: s })}
              >
                {POTENTIAL_STATUS_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        {draft.status === "dropped" && (
          <Field id="pf-dropReason" label="Why was it dropped? *" error={errors.dropReason}>
            <input
              id="pf-dropReason"
              className={`pf-input ${errors.dropReason ? "invalid" : ""}`}
              value={draft.dropReason}
              onChange={(e) => onChange({ dropReason: e.target.value })}
              placeholder="e.g. Landlord withdrew, too small"
              {...invalid("dropReason")}
            />
          </Field>
        )}

        <Field id="pf-coords" label="Location" error={coordsError ?? errors.location} hint="Latitude, longitude">
          <input
            id="pf-coords"
            className="pf-input font-mono"
            value={coords}
            inputMode="decimal"
            onChange={(e) => {
              setCoordsText(e.target.value);
              const parsed = parseCoordinateInput(e.target.value);
              if (parsed && "point" in parsed) onChange({ lat: parsed.point.lat, lng: parsed.point.lng });
            }}
            onBlur={() => !coordsError && setCoordsText(null)}
          />
        </Field>

        <details className="pf-more" open={more} onToggle={(e) => setMore((e.target as HTMLDetailsElement).open)}>
          <summary>More details</summary>
          <div className="pf-more-body">
            <div className="pf-pair">
              <Field id="pf-size" label="Size (m²)">
                <input
                  id="pf-size"
                  className="pf-input"
                  inputMode="decimal"
                  value={draft.size ?? ""}
                  onChange={(e) => onChange({ size: numberOrNull(e.target.value) })}
                />
              </Field>
              <Field
                id="pf-rent"
                label="Asking rent / yr"
                hint={
                  rate !== null ? `${CURRENCY} ${Math.round(rate).toLocaleString()} per m²` : `${CURRENCY}, without VAT`
                }
              >
                <input
                  id="pf-rent"
                  className="pf-input"
                  inputMode="decimal"
                  value={draft.askingRentAnnual ?? ""}
                  onChange={(e) => onChange({ askingRentAnnual: numberOrNull(e.target.value) })}
                />
              </Field>
            </div>
            <Field id="pf-contact" label="Contact (landlord / broker)">
              <input
                id="pf-contact"
                className="pf-input"
                value={draft.contact}
                onChange={(e) => onChange({ contact: e.target.value })}
              />
            </Field>
            <Field id="pf-notes" label="Notes" hint="Ctrl+Enter saves">
              <textarea
                id="pf-notes"
                className="pf-input pf-textarea"
                value={draft.notes}
                onChange={(e) => onChange({ notes: e.target.value })}
                rows={3}
              />
            </Field>
            <Field id="pf-feasibilityLink" label="Feasibility study link" error={errors.feasibilityLink}>
              <input
                id="pf-feasibilityLink"
                className={`pf-input ${errors.feasibilityLink ? "invalid" : ""}`}
                value={draft.feasibilityLink}
                onChange={(e) => onChange({ feasibilityLink: e.target.value })}
                placeholder="https://"
                inputMode="url"
                {...invalid("feasibilityLink")}
              />
            </Field>
            <Field id="pf-addedBy" label="Added by">
              <input
                id="pf-addedBy"
                className="pf-input"
                value={draft.addedBy}
                onChange={(e) => onChange({ addedBy: e.target.value })}
                autoComplete="name"
              />
            </Field>
          </div>
        </details>
      </div>

      <footer className="pf-foot">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn-primary">
          {mode === "add" ? "Add potential" : "Save"}
        </button>
      </footer>
    </form>
  );
}
