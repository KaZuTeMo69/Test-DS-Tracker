import { useEffect, useState } from "react";
import { Settings as SettingsIcon, X } from "lucide-react";
import { DEFAULT_SETTINGS, MAX_DAYS, MAX_PERCENT, Settings, toWholeNumber, VAT_RATE } from "../lib/settings";
import { formatDate, today } from "../lib/contract";
import { checkOrsKey, KEY_CHECK_MESSAGE, KeyCheck } from "../lib/roads";

interface SettingsModalProps {
  isOpen: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
  orsKey: string; // kept apart from the other settings: Reset to defaults leaves it
  onOrsKey: (key: string) => void;
}

/**
 * The OpenRouteService key: typed or pasted, and saved when the field is left (or Enter), not on every keystroke,
 * so routes on the map aren't asked for again while it's being typed. Hidden like a password unless shown.
 * A saved key is checked straight away with one tiny route, so it's clear whether OpenRouteService takes it.
 */
function OrsKeyField({ value, onSave }: { value: string; onSave: (key: string) => void }) {
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(false);
  useEffect(() => setDraft(value), [value]);
  const [check, setCheck] = useState<KeyCheck | "checking" | null>(null);
  const [round, setRound] = useState(0); // "Check again"
  useEffect(() => {
    if (!value) {
      setCheck(null);
      return;
    }
    const abort = new AbortController();
    setCheck("checking");
    checkOrsKey(value, { signal: abort.signal }).then(setCheck, () => {}); // only an abort lands here
    return () => abort.abort();
  }, [value, round]);
  const save = () => {
    if (draft.trim() !== value) onSave(draft);
  };
  return (
    <div className="settings-key">
      <label className="settings-key-label" htmlFor="ors-key">
        OpenRouteService API key
      </label>
      <div className="settings-key-row">
        <input
          id="ors-key"
          type={shown ? "text" : "password"}
          className="zone-input settings-key-input"
          placeholder="Optional: paste your free key"
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
        <button type="button" className="layer-action" onClick={() => setShown(!shown)} aria-pressed={shown}>
          {shown ? "Hide" : "Show"}
        </button>
        {value && (
          <button
            type="button"
            className="layer-action"
            onClick={() => {
              setDraft("");
              onSave("");
            }}
          >
            Remove
          </button>
        )}
      </div>
      <p
        className={`settings-key-status ${check === "ok" || check === "no-route" ? "ok" : check && check !== "checking" ? "bad" : ""}`}
        aria-live="polite"
        data-key-check={check ?? "none"}
      >
        {!value
          ? "No key: routes use the public OSRM server."
          : check === "checking" || check === null
            ? "Checking the key with OpenRouteService…"
            : KEY_CHECK_MESSAGE[check]}
        {value && check !== "checking" && check !== "ok" && check !== "no-route" && (
          <>
            {" "}
            <button type="button" className="settings-key-retry" onClick={() => setRound(round + 1)}>
              Check again
            </button>
          </>
        )}
      </p>
    </div>
  );
}

const DAY_MS = 86_400_000;
const VAT_PERCENT = Math.round(VAT_RATE * 100);

// A number typed freely; it takes effect as soon as it's a whole number from 0 to max
function NumberInput({
  value,
  onChange,
  label,
  max = MAX_DAYS,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  max?: number;
}) {
  const [draft, setDraft] = useState(String(value));
  // Follow changes made elsewhere, such as Reset to defaults
  useEffect(() => setDraft(String(value)), [value]);
  const valid = toWholeNumber(draft, max) !== null;
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      step={1}
      aria-label={label}
      aria-invalid={!valid}
      className={`settings-days zone-input ${valid ? "" : "invalid"}`}
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = toWholeNumber(e.target.value, max);
        if (n !== null) onChange(n);
      }}
      onBlur={() => setDraft(String(value))}
    />
  );
}

/** Renewal lead and warning days, and whether rent is shown with VAT. Changes apply at once. */
export default function SettingsModal({ isOpen, settings, onChange, onClose, orsKey, onOrsKey }: SettingsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    // Esc closes just this window (preventDefault tells the page's own Esc handling it's been used)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // An example with the current numbers: a contract ending on the next 31 December
  const now = today();
  const year = now.getUTCMonth() === 11 && now.getUTCDate() === 31 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  const end = new Date(Date.UTC(year, 11, 31));
  const start = new Date(end.getTime() - settings.leadDays * DAY_MS);
  const warn = new Date(start.getTime() - settings.warningDays * DAY_MS);
  // Pin colours, the Potentials shown on the map and your name are chosen elsewhere or personal, so Reset leaves them
  const isDefault =
    settings.leadDays === DEFAULT_SETTINGS.leadDays &&
    settings.warningDays === DEFAULT_SETTINGS.warningDays &&
    settings.includeVat === DEFAULT_SETTINGS.includeVat &&
    settings.rentFlagPercent === DEFAULT_SETTINGS.rentFlagPercent;

  return (
    <div
      data-modal
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[9000] backdrop-blur-md settings-backdrop"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="settings-modal relative bg-[#111111] border border-[#262626] rounded-[20px] w-full max-w-[480px] shadow-[0_30px_80px_rgba(0,0,0,0.8)] overflow-y-auto max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/5 rounded-full transition-all cursor-pointer border border-[#262626]"
          title="Close"
        >
          <X size={16} />
        </button>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#fbbf24]/10 border border-[#fbbf24]/20 flex items-center justify-center text-[#fbbf24]">
            <SettingsIcon size={20} />
          </div>
          <h2
            id="settings-title"
            className="text-xl font-bold font-['Oswald'] tracking-wide text-white uppercase italic"
          >
            Settings
          </h2>
        </div>

        <section className="settings-section">
          <h3 className="detail-panel-row-label text-[11px]">Renewal</h3>
          <label className="settings-row">
            <span>Start renewal</span>
            <NumberInput
              value={settings.leadDays}
              onChange={(leadDays) => onChange({ leadDays })}
              label="Days before the contract ends"
            />
            <span>days before the contract ends</span>
          </label>
          <label className="settings-row">
            <span>Show Renew soon</span>
            <NumberInput
              value={settings.warningDays}
              onChange={(warningDays) => onChange({ warningDays })}
              label="Days before renewal starts"
            />
            <span>days before renewal starts</span>
          </label>
          <p className="settings-note">
            For example, a contract ending on <b>{formatDate(end)}</b> shows Renew soon from <b>{formatDate(warn)}</b>{" "}
            and Renew now from <b>{formatDate(start)}</b>. Whole numbers from 0 to {MAX_DAYS}.
          </p>
        </section>

        <section className="settings-section">
          <h3 className="detail-panel-row-label text-[11px]">Rent</h3>
          <label className="settings-row settings-toggle-row">
            <input
              type="checkbox"
              role="switch"
              className="settings-switch"
              checked={settings.includeVat}
              onChange={(e) => onChange({ includeVat: e.target.checked })}
            />
            <span>Show rent including VAT ({VAT_PERCENT}%)</span>
          </label>
          <p className="settings-note">
            The rent in your data is without VAT. With this on, annual, monthly and per m² rent across the app include{" "}
            {VAT_PERCENT}% VAT. The CSV export keeps the figures as they are in your data.
          </p>
          <label className="settings-row">
            <span>Flag rent per m² more than</span>
            <NumberInput
              value={settings.rentFlagPercent}
              onChange={(rentFlagPercent) => onChange({ rentFlagPercent })}
              label="Percent above the city median"
              max={MAX_PERCENT}
            />
            <span>% above the city median</span>
          </label>
          <p className="settings-note">
            Stores over this get a HIGH RENT tag, and a red pin when the map colours pins by rent per m². A city needs 3
            stores with rent and area to have a median. Whole numbers from 0 to {MAX_PERCENT}.
          </p>
        </section>

        <section className="settings-section">
          <h3 className="detail-panel-row-label text-[11px]">Potentials</h3>
          <label className="settings-row">
            <span>Your name</span>
            <input
              id="added-by"
              className="zone-input settings-name-input"
              placeholder="Optional"
              maxLength={80}
              autoComplete="name"
              value={settings.addedBy}
              onChange={(e) => onChange({ addedBy: e.target.value })}
            />
          </label>
          <p className="settings-note">Put in "Added by" on the Potentials you add. Kept in this browser only.</p>
        </section>

        <section className="settings-section">
          <h3 className="detail-panel-row-label text-[11px]">Road routing</h3>
          <OrsKeyField value={orsKey} onSave={onOrsKey} />
          <p className="settings-note">
            Free and optional: sign up at{" "}
            <a href="https://openrouteservice.org/dev/#/signup" target="_blank" rel="noopener noreferrer">
              openrouteservice.org
            </a>{" "}
            (run by HeiGIT) and copy the key from your dashboard (about 2,000 routes and 500 distance lookups a day).
            Without one, or when it runs out, routes come from the public OSRM server. The key stays in this browser: it
            isn't in the page's address or the app's code, and only OpenRouteService receives it. Routing sends just the
            points' coordinates.
          </p>
        </section>

        <div className="settings-footer flex items-center gap-3">
          <span className="text-[11px] text-gray-400 flex-1">Saved in this browser only.</span>
          <button
            onClick={() =>
              onChange({
                ...DEFAULT_SETTINGS,
                pinColors: settings.pinColors,
                showPotentials: settings.showPotentials,
                showDroppedPotentials: settings.showDroppedPotentials,
                addedBy: settings.addedBy,
              })
            }
            disabled={isDefault}
            className="layer-action"
          >
            Reset to defaults
          </button>
          <button onClick={onClose} className="zone-card-btn primary settings-done">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
