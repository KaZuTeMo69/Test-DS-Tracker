import { useCallback, useEffect, useRef, useState } from "react";

/** A short message at the bottom of the screen that hides itself after a few seconds. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // A new message restarts the timer, so it isn't cut short by the previous message's timer
  const showToast = useCallback((msg: string) => {
    window.clearTimeout(timerRef.current);
    setMessage(msg);
    // Longer messages (a routing fallback, say) stay long enough to read
    timerRef.current = window.setTimeout(() => setMessage(null), Math.min(8000, Math.max(2800, msg.length * 55)));
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { message, showToast };
}
