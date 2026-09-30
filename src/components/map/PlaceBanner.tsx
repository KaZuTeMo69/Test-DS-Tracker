import { useEffect } from "react";
import { Diamond, X } from "lucide-react";

/** Shown while placing a new Potential: the next click on the map puts it there. Esc or Cancel stops. */
export default function PlaceBanner({ onCancel }: { onCancel: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    <div
      className="measure-bar place-banner absolute left-1/2 -translate-x-1/2 z-[1000] pointer-events-auto"
      role="status"
      aria-live="polite"
      onClick={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
    >
      <div className="measure-bar-head">
        <Diamond size={15} className="text-[#fbbf24] shrink-0" fill="currentColor" />
        <span className="measure-bar-title">Add potential</span>
        <span className="measure-bar-step">Click the map where it is · Esc to cancel</span>
        <button className="measure-bar-close" onClick={onCancel} title="Cancel (Esc)" aria-label="Cancel adding">
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
