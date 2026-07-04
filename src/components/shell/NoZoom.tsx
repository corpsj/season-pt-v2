"use client";
import { useEffect } from "react";

/**
 * Disable pinch / double-tap / gesture zoom app-wide — browser AND installed PWA
 * (사용자 요청: 브라우저에서도 확대 안 되게).
 *
 * Android / Chromium / desktop are handled declaratively by the viewport export in
 * layout.tsx (`maximum-scale=1, user-scalable=no`). This component is the backstop for
 * engines that IGNORE user-scalable:
 *  - iOS Safari / WKWebView (since iOS 10): block the `gesture*` (pinch) events and
 *    multi-touch `touchmove`, plus `touch-action: manipulation` to kill double-tap zoom.
 *  - Desktop: also block ctrl/⌘ + wheel and ctrl/⌘ + [+ - = 0] as a hardening measure.
 *
 * Single-finger scrolling is untouched (we only preventDefault when >1 touch).
 */
export function NoZoom() {
  useEffect(() => {
    // Kill double-tap zoom without breaking scroll or taps.
    const rootEl = document.documentElement;
    const prevTouchAction = rootEl.style.touchAction;
    rootEl.style.touchAction = "manipulation";

    // iOS pinch: block gesture* + 2-finger touchmove. Desktop: ctrl/⌘ zoom.
    const blockGesture = (e: Event) => e.preventDefault();
    const blockPinch = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault();
    };
    const blockWheelZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    const blockKeyZoom = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ["+", "-", "=", "0"].includes(e.key)) {
        e.preventDefault();
      }
    };

    const opts = { passive: false } as const;
    document.addEventListener("gesturestart", blockGesture, opts);
    document.addEventListener("gesturechange", blockGesture, opts);
    document.addEventListener("gestureend", blockGesture, opts);
    document.addEventListener("touchmove", blockPinch, opts);
    document.addEventListener("wheel", blockWheelZoom, opts);
    document.addEventListener("keydown", blockKeyZoom);

    return () => {
      rootEl.style.touchAction = prevTouchAction;
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
      document.removeEventListener("touchmove", blockPinch);
      document.removeEventListener("wheel", blockWheelZoom);
      document.removeEventListener("keydown", blockKeyZoom);
    };
  }, []);

  return null;
}
