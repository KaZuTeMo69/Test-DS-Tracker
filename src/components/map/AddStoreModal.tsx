import { useState } from "react";
import { X } from "lucide-react";
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

  const save = () => {
    if (!name.trim()) {
      alert("Please enter a store name.");
      return;
    }
    if (!city.trim()) {
      alert("Please enter a city.");
      return;
    }
    onSave(name.trim(), city.trim());
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] p-4 pointer-events-auto"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div className="bg-[#111111] border border-[#333] rounded-2xl p-6 w-[400px] max-w-[90vw] shadow-[0_20px_50px_rgba(0,0,0,0.6)] duration-300">
        <div className="flex justify-between items-center mb-5 border-b border-white/5 pb-3">
          <h3 className="text-sm font-black font-sans text-[#fbbf24] uppercase tracking-wider">Add Manual Store</h3>
          <button onClick={onCancel} className="text-gray-400 hover:text-white transition-colors" type="button">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Store Name
            </label>
            <input
              type="text"
              className="w-full bg-[#1c1c1c] border border-[#333] rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-[#fbbf24] transition-colors font-sans"
              placeholder="e.g. Al Yasmin Express"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">City</label>
            <input
              type="text"
              className="w-full bg-[#1c1c1c] border border-[#333] rounded-lg px-3 py-2.5 text-xs text-white outline-none focus:border-[#fbbf24] transition-colors font-sans"
              placeholder="e.g. Riyadh"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
              Location Coordinates
            </label>
            <div className="font-mono text-xs text-gray-400 bg-white/5 px-3 py-2 rounded-lg border border-white/5">
              {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-[#1c1c1c] border border-[#333] text-gray-300 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white/5 cursor-pointer"
            type="button"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex-1 py-3 bg-[#fbbf24] text-black rounded-lg text-xs font-black uppercase tracking-wider hover:opacity-90 active:scale-[0.98] transition-transform cursor-pointer"
            type="button"
          >
            Save Store
          </button>
        </div>
      </div>
    </div>
  );
}
