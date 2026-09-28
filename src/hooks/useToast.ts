import { useCallback, useEffect, useRef, useState } from "react";

/** A short message at the bottom of the screen that hides itself after a few seconds. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  // A new message restarts the timer, so it isn't cut short by the previous message's timer
  const showToast = useCallback((msg: string) => {
    window.clearTimeout(timerRef.current);
    setMessage(msg);
    timerRef.current = window.setTimeout(() => setMessage(null), 2800);
  }, []);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  return { message, showToast };
}
