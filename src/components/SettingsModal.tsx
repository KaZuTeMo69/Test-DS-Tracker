import { useEffect, useState } from "react";
import { Settings as SettingsIcon, X } from "lucide-react";
import { DEFAULT_SETTINGS, MAX_DAYS, MAX_PERCENT, Settings, toWholeNumber, VAT_RATE } from "../lib/settings";
import { formatDate, today } from "../lib/contract";

interface SettingsModalProps {
  isOpen: boolean;
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onClose: () => void;
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
export default function SettingsModal({ isOpen, settings, onChange, onClose }: SettingsModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
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
  // Pin colours are chosen on the map legend, so Reset leaves them as they are
  const isDefault =
    settings.leadDays === DEFAULT_SETTINGS.leadDays &&
    settings.warningDays === DEFAULT_SETTINGS.warningDays &&
    settings.includeVat === DEFAULT_SETTINGS.includeVat &&
    settings.rentFlagPercent === DEFAULT_SETTINGS.rentFlagPercent;

  return (
    <div
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
          <h3 className="detail-panel-row-label text-[10px]">Renewal</h3>
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
          <h3 className="detail-panel-row-label text-[10px]">Rent</h3>
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

        <div className="settings-footer flex items-center gap-3">
          <span className="text-[11px] text-gray-500 flex-1">Saved in this browser only.</span>
          <button
            onClick={() => onChange({ ...DEFAULT_SETTINGS, pinColors: settings.pinColors })}
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
