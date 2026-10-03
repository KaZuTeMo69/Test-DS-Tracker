import { Check, Undo2, X } from "lucide-react";
import { MapMode } from "./ZoneEditor";

interface EditBannerProps {
  mode: MapMode;
  layerName: string;
  zoneName: string;
  onFinish: () => void;
  onUndo: () => void;
  onCancel: () => void;
}

/**
 * Instructions and buttons shown at the top of the map while drawing a zone or editing its shape. On a phone it's
 * one short line and one row of buttons, below the sidebar button, so it covers as little of the map as possible.
 */
export default function EditBanner({ mode, layerName, zoneName, onFinish, onUndo, onCancel }: EditBannerProps) {
  const drawing = mode.kind === "draw";
  const name = <b className="text-[#fbbf24]">{drawing ? layerName : zoneName || "Unnamed zone"}</b>;
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- only keeps clicks inside from reaching the map; the controls inside are buttons
    <div
      className="edit-banner absolute top-[84px] sm:top-4 left-1/2 -translate-x-1/2 w-[560px] max-w-[calc(100%-32px)] sm:max-w-[calc(100%-80px)] z-[1000] bg-[#111111]/95 backdrop-blur-md border border-[#fbbf24]/40 rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      onClick={stop}
      onMouseDown={stop}
      onDoubleClick={stop}
    >
      <div className="text-[12px] text-gray-100 leading-snug">
        {drawing ? (
          <>
            <span className="hidden sm:inline">
              Drawing a zone in {name}. Click the map to place corners, then click the first corner or Finish.
            </span>
            <span className="sm:hidden">Drawing in {name}: tap to add corners.</span>
          </>
        ) : (
          <>
            <span className="hidden sm:inline">
              Editing {name}. Drag a corner to move it, drag a midpoint to add one, right-click a corner to remove it.
            </span>
            <span className="sm:hidden">Editing {name}: drag corners; long-press one to remove it.</span>
          </>
        )}
      </div>
      <div className="flex gap-2 edit-banner-buttons">
        {drawing && (
          <button onClick={onUndo} className="edit-banner-btn" title="Remove the last corner">
            <Undo2 size={13} /> Undo
          </button>
        )}
        <button onClick={onFinish} className="edit-banner-btn primary" title="Enter">
          <Check size={13} /> {drawing ? "Finish" : "Save"}
        </button>
        <button onClick={onCancel} className="edit-banner-btn" title="Esc">
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}
