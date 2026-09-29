import { useEffect, useRef } from "react";

// Shows the next batch of a long list when it scrolls into view. Keyed by the batch size, so it checks again after
// each batch
export default function LoadMore({
  onVisible,
  text = "Loading more stores…",
}: {
  onVisible: () => void;
  text?: string;
  key?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) onVisible();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [onVisible]);
  return (
    <div ref={ref} className="text-center py-3 text-[11px] text-gray-500">
      {text}
    </div>
  );
}
