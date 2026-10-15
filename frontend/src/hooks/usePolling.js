import { useEffect, useRef } from "react";

const DEFAULT_POLLING_INTERVAL = 5000;

export default function usePolling(
  callback,
  intervalMs = DEFAULT_POLLING_INTERVAL,
) {
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    let timeoutId;
    let cancelled = false;

    const poll = async () => {
      try {
        if (document.visibilityState === "visible") {
          await callbackRef.current();
        }
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(poll, intervalMs);
        }
      }
    };

    timeoutId = window.setTimeout(poll, intervalMs);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [intervalMs]);
}
