"use client";
import { useEffect } from "react";

/**
 * Disable pinch / double-tap / gesture zoom — but ONLY in the installed
 * (standalone) PWA, i.e. "웹앱으로 켰을 때".
 *
 * The BROWSER viewport intentionally keeps zoom ON for accessibility
 * (중장년 회원이 작은 글씨를 확대할 수 있어야 한다 — see the viewport comment in
 * layout.tsx / 감사 low). Locking scale there would regress that decision, so we
 * only clamp scale inside the installed app, where accidental pinch-zoom breaks
 * the native-like feel.
 *
 * Platform coverage (each engine handles zoom differently):
 *  - Android/Chromium: respects `maximum-scale=1, user-scalable=no` once we
 *    harden the viewport <meta> at runtime.
 *  - iOS Safari/WKWebView: IGNORES user-scalable since iOS 10 → we block the
 *    `gesture*` (pinch) events and multi-touch `touchmove`, plus
 *    `touch-action: manipulation` to kill double-tap zoom.
 *  - Desktop standalone: block ctrl/⌘ + wheel and ctrl/⌘ + [+ - = 0].
 *
 * Single-finger scrolling is untouched (we only preventDefault when >1 touch).
 */
export function NoZoom() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS home-screen web apps report standalone here, not via matchMedia.
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (!standalone) return;

    // 1) Harden the viewport meta so Chromium locks the scale.
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    const prevContent = meta?.getAttribute("content") ?? null;
    meta?.setAttribute(
      "content",
      "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
    );

    // 2) Kill double-tap zoom without breaking scroll or taps.
    const rootEl = document.documentElement;
    const prevTouchAction = rootEl.style.touchAction;
    rootEl.style.touchAction = "manipulation";

    // 3) iOS pinch: block gesture* + 2-finger touchmove. Desktop: ctrl/⌘ zoom.
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
      if (meta && prevContent !== null) meta.setAttribute("content", prevContent);
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
