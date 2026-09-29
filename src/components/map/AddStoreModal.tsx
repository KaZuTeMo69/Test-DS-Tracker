import { FormEvent, useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";
import { LatLng } from "../../lib/coords";

interface AddStoreModalProps {
  pin: LatLng;
  onCancel: () => void;
  onSave: (name: string, city: string) => void;
}

/** Asks for the name and city of a store added at the searched coordinate. */
export default function AddStoreModal({ pin, onCancel, onSave }: AddStoreModalProps) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  // Once Save has been tried, what's missing is said under its field (instead of a browser alert)
  const [tried, setTried] = useState(false);
  const nameMissing = !name.trim();
  const cityMissing = !city.trim();

  // Esc closes the window, also when nothing in it has focus (preventDefault tells the page it's been used)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const save = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (nameMissing || cityMissing) return;
    onSave(name.trim(), city.trim());
  };

  return (
    <div
      data-modal
      className="modal-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] pointer-events-auto"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
      onMouseDown={(e) => e.stopPropagation()}
      // Keys typed here stay here (not the map's, nor the page's F for focus mode); Esc still closes
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onCancel();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-store-title"
        className="modal-card add-store-modal bg-[#111111] border border-[#2a2a2a] rounded-[20px] w-full shadow-[0_20px_50px_rgba(0,0,0,0.6)]"
        onClick={(e) => e.stopPropagation()}
        onSubmit={save}
        noValidate
      >
        <header className="modal-head">
          <div className="modal-icon">
            <MapPin size={19} />
          </div>
          <div className="min-w-0">
            <h2 id="add-store-title" className="modal-title">
              Add a store here
            </h2>
            <p className="modal-subtitle font-mono">
              {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
            </p>
          </div>
          <button type="button" onClick={onCancel} className="modal-close" title="Close" aria-label="Close">
            <X size={16} />
          </button>
        </header>

        <div className="modal-body">
          <label className="field">
            <span className="field-label">Store name</span>
            <input
              type="text"
              className={`field-input plain ${tried && nameMissing ? "invalid" : ""}`}
              placeholder="e.g. Al Yasmin Express"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={tried && nameMissing}
              autoFocus
            />
            {tried && nameMissing && <span className="field-help warn">Enter the store's name.</span>}
          </label>

          <label className="field">
            <span className="field-label">City</span>
            <input
              type="text"
              className={`field-input plain ${tried && cityMissing ? "invalid" : ""}`}
              placeholder="e.g. Riyadh"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              aria-invalid={tried && cityMissing}
            />
            {tried && cityMissing && <span className="field-help warn">Enter the city it's in.</span>}
          </label>

          <p className="field-help">
            The rest (DS code, contract, rent) stays blank and is listed under Data quality. The store is saved in this
            browser only.
          </p>

          <div className="modal-actions">
            <button type="button" onClick={onCancel} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Save Store
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
