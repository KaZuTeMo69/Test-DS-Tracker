import { CSSProperties } from "react";

// Grey shapes where content will appear, shown while a saved Google Sheet or the charts load, so the page doesn't
// look empty (or show zeros) meanwhile

/** One placeholder bar. */
export function Bone({ w, h, className = "" }: { w: CSSProperties["width"]; h: number; className?: string }) {
  return <span className={`skeleton block ${className}`} style={{ width: w, height: h }} aria-hidden="true" />;
}

/** Placeholder cards shaped like the store list, announced once to screen readers. */
export function ListSkeleton({ rows = 6, label }: { rows?: number; label: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-3" data-skeleton>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-card bg-[#111] border border-[#222] rounded-lg" aria-hidden="true">
          <div className="flex justify-between gap-3">
            <div className="flex-1 flex flex-col gap-2">
              <Bone w={`${70 - (i % 3) * 12}%`} h={14} />
              <Bone w="40%" h={10} />
            </div>
            <Bone w={52} h={16} className="rounded-full" />
          </div>
          <div className="flex gap-3 skeleton-gap">
            <Bone w={56} h={10} />
            <Bone w={88} h={10} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Placeholders shaped like the Growth tab's two bar charts. */
export function ChartSkeleton({ label = "Loading charts" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-8" data-skeleton>
      <span className="sr-only">{label}</span>
      {[0, 1].map((chart) => (
        <div key={chart} aria-hidden="true">
          <Bone w={150} h={11} />
          <div className="skeleton-chart bg-black/20 rounded-xl border border-white/5 flex flex-col justify-center gap-3">
            {[92, 74, 60, 48, 36, 24].map((w, i) => (
              <div key={i} className="flex items-center gap-3">
                <Bone w={56} h={9} />
                <Bone w={`${w}%`} h={11} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
