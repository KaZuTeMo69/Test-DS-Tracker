import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useIsPhone } from "../hooks/useMediaQuery";
import { useSheetDrag } from "../hooks/useSheetDrag";

type Snap = "peek" | "half" | "full";
const SNAPS: Snap[] = ["peek", "half", "full"];
// The next card opens at the height the last one was left at, but not all the way up, so the map still shows
let lastSnap: Snap = "half";
const PEEK_ESTIMATE = 150; // the header's height, before it's measured

/** How much of the map (of this height) the next phone sheet covers when it opens, to zoom to an area above it. */
export const openingSheetHeight = (mapHeight: number) =>
  lastSnap === "peek" ? PEEK_ESTIMATE : Math.round(mapHeight * 0.52);

interface CardFrameProps {
  width: number; // of the card on larger screens
  label: string; // what the card is, for screen readers
  onClose: () => void;
  onInset?: (px: number) => void; // how much of the bottom of the map the sheet covers (0 when it isn't one)
  children: ReactNode; // a header marked data-sheet-header, then the rest; the header drags the sheet
}

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

// On a phone: a sheet over the bottom of the map, dragged by its handle or header between three heights
function BottomSheet({ label, onClose, onInset, children }: Omit<CardFrameProps, "width">) {
  const ref = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<Snap>(lastSnap);
  const [room, setRoom] = useState({ map: 0, header: PEEK_ESTIMATE });

  // The map's height and the header's, for the three heights
  useLayoutEffect(() => {
    const sheet = ref.current;
    const map = sheet?.parentElement;
    if (!sheet || !map) return;
    const measure = () => {
      const header = sheet.querySelector<HTMLElement>("[data-sheet-header]");
      const headerBottom = header ? header.offsetTop + header.offsetHeight : 150;
      setRoom({ map: map.clientHeight, header: headerBottom + 6 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(map);
    return () => observer.disconnect();
  }, []);

  const heights: Record<Snap, number> = {
    peek: Math.min(room.header, room.map * 0.45),
    half: Math.round(room.map * 0.52),
    full: Math.max(room.map - 120, room.header), // the search bar and the map buttons at the top stay in reach
  };
  const shown = heights[snap];

  useEffect(() => {
    lastSnap = snap === "full" ? "half" : snap;
  }, [snap]);
  useEffect(() => {
    if (room.map) onInset?.(shown);
  }, [shown, room.map, onInset]);
  useEffect(() => () => onInset?.(0), [onInset]);

  const { dragHeight, dragging, handlers, onHandleKey } = useSheetDrag({
    snaps: SNAPS,
    heights,
    snap,
    setSnap,
    // A tap on the handle opens the sheet all the way, or back to half
    onHandleTap: () => setSnap(snap === "full" ? "half" : "full"),
    onDismiss: onClose,
  });

  return (
    <div
      ref={ref}
      role="region"
      aria-label={label}
      data-snap={snap}
      onClick={stop}
      {...handlers}
      className={`bottom-sheet map-card absolute left-0 right-0 bottom-0 bg-[#111111]/[0.97] backdrop-blur-md border border-b-0 border-[#333] rounded-t-2xl shadow-[0_-10px_30px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col z-[1100] ${dragging ? "dragging" : ""}`}
      style={{ height: dragHeight ?? shown }}
    >
      <button
        className="sheet-handle"
        aria-label={snap === "full" ? "Make the card smaller (or drag it)" : "Make the card bigger (or drag it)"}
        onClick={(e) => {
          // Pointer taps are handled on pointer up; this is for the keyboard (Enter / Space)
          if (e.detail === 0) setSnap(snap === "full" ? "half" : "full");
        }}
        onKeyDown={onHandleKey}
      >
        <span />
      </button>
      {children}
    </div>
  );
}

/**
 * The frame of the store and zone cards: a card at the top right of the map on larger screens, and on a phone a
 * sheet at the bottom that can be dragged between just its header, half the map and nearly all of it, or down to close.
 */
export default function CardFrame({ width, label, onClose, onInset, children }: CardFrameProps) {
  const phone = useIsPhone();
  if (phone) {
    return (
      <BottomSheet label={label} onClose={onClose} onInset={onInset}>
        {children}
      </BottomSheet>
    );
  }
  return (
    <div
      onClick={stop}
      role="region"
      aria-label={label}
      className="map-card absolute top-[12px] right-[52px] max-h-[calc(100%-32px)] max-w-[calc(100%-64px)] bg-[#111111]/95 backdrop-blur-md border border-[#333] rounded-xl shadow-2xl overflow-hidden flex flex-col z-[600]"
      style={{ width }}
    >
      {children}
    </div>
  );
}
