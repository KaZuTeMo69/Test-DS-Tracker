import { KeyboardEvent, PointerEvent, useRef, useState } from "react";

interface SheetDrag<S extends string> {
  snaps: S[]; // lowest to highest
  heights: Record<S, number>;
  snap: S;
  setSnap: (snap: S) => void;
  onHandleTap: () => void;
  onDismiss?: () => void; // dragged or flicked below the lowest height; without it the sheet stops there
}

/**
 * Dragging a sheet at the bottom of the map up and down between its heights, by its handle or by anything marked
 * data-sheet-drag (whose buttons and fields still work). A quick flick goes on to the next height.
 */
export function useSheetDrag<S extends string>({
  snaps,
  heights,
  snap,
  setSnap,
  onHandleTap,
  onDismiss,
}: SheetDrag<S>) {
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ y: number; height: number; time: number; moved: boolean; onHandle: boolean } | null>(null);
  const top = snaps[snaps.length - 1];
  const step = (by: number) => setSnap(snaps[Math.min(snaps.length - 1, Math.max(0, snaps.indexOf(snap) + by))]);

  const onPointerDown = (e: PointerEvent<HTMLElement>) => {
    const target = e.target as HTMLElement;
    const onHandle = !!target.closest(".sheet-handle");
    if (!target.closest("[data-sheet-drag]") && !onHandle) return;
    if (!onHandle && target.closest("button, a, input, textarea, select, label")) return;
    drag.current = { y: e.clientY, height: heights[snap], time: e.timeStamp, moved: false, onHandle };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 5) d.moved = true;
    if (d.moved) setDragHeight(Math.max(40, Math.min(heights[top], d.height - dy)));
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    setDragHeight(null);
    if (!d.moved) {
      if (d.onHandle) onHandleTap();
      return;
    }
    const dy = e.clientY - d.y;
    const speed = dy / Math.max(1, e.timeStamp - d.time); // px per ms, down is positive
    const height = d.height - dy;
    if (onDismiss && (height < heights[snaps[0]] - 50 || (speed > 0.9 && snap === snaps[0]))) {
      onDismiss();
      return;
    }
    // The nearest height, or the next one in the direction of a quick flick
    const nearest = snaps.reduce((a, b) => (Math.abs(heights[b] - height) < Math.abs(heights[a] - height) ? b : a));
    const i = snaps.indexOf(nearest);
    if (speed < -0.5 && heights[nearest] <= height) setSnap(snaps[Math.min(snaps.length - 1, i + 1)]);
    else if (speed > 0.5 && heights[nearest] >= height) setSnap(snaps[Math.max(0, i - 1)]);
    else setSnap(nearest);
  };
  const onHandleKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "ArrowUp") step(1);
    else if (e.key === "ArrowDown") step(-1);
    else return;
    e.preventDefault();
  };

  return {
    dragHeight,
    dragging: dragHeight !== null,
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp },
    onHandleKey,
  };
}
