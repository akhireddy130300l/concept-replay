import { useEffect, useRef, useState } from "react";
import { pollIntervalFor } from "@/lib/cloudCostGuard";

/**
 * Cost-guarded polling: never faster than the guard floor and completely
 * suspended while the tab is hidden. Returns the current visibility state.
 */
export function useVisibilityPoll(fn: () => void, requestedMs?: number): boolean {
  const saved = useRef(fn);
  saved.current = fn;
  const [visible, setVisible] = useState(() =>
    typeof document === "undefined" ? true : document.visibilityState !== "hidden",
  );

  useEffect(() => {
    const onChange = () => setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  useEffect(() => {
    const interval = pollIntervalFor(visible, requestedMs);
    if (interval === null) return;
    saved.current();
    const t = setInterval(() => saved.current(), interval);
    return () => clearInterval(t);
  }, [visible, requestedMs]);

  return visible;
}
