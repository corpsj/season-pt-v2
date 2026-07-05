"use client";
import { useEffect, useRef } from "react";

/**
 * Run `fn` immediately, then every `intervalMs` while the tab is visible.
 * Pauses when the tab is hidden and runs once + resumes when it returns.
 * `fn` is read from a ref so the interval always calls the latest closure
 * without being recreated on every render. No-op when `enabled` is false.
 */
export function usePolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  enabled = true
): void {
  const fnRef = useRef(fn);

  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;

    const tick = () => {
      void fnRef.current();
    };
    const start = () => {
      if (timer) return;
      tick();
      timer = setInterval(tick, intervalMs);
    };
    const stop = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") stop();
      else start();
    };

    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
