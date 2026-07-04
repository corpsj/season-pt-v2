"use client";
import { useEffect } from "react";

/**
 * Disable pinch / double-tap / gesture zoom app-wide — browser AND installed PWA
 * (사용자 요청: 브라우저에서도 확대 안 되게).
 *
 * Android / Chromium / desktop are handled declaratively by the viewport export in
 * layout.tsx (`maximum-scale=1, user-scalable=no`). This component is the backstop for
 * engines that IGNORE user-scalable:
 *  - iOS Safari / WKWebView (since iOS 10): block the `gesture*` (pinch) events, plus
 *    `touch-action: manipulation` to kill double-tap zoom.
 *  - Desktop: also block ctrl/⌘ + wheel and ctrl/⌘ + [+ - = 0] as a hardening measure.
 *
 * NOTE: 예전엔 document에 non-passive `touchmove`(2-finger 차단)도 걸었으나, 모든 스크롤
 * 프레임에 동기 JS를 강제해 성능을 깎았다. iOS 핀치는 gesture* preventDefault로 이미
 * 막히고, Android/데스크톱은 viewport meta가 처리하므로 제거했다. 스크롤은 온전히 passive.
 */
export function NoZoom() {
  useEffect(() => {
    // Kill double-tap zoom without breaking scroll or taps.
    const rootEl = document.documentElement;
    const prevTouchAction = rootEl.style.touchAction;
    rootEl.style.touchAction = "manipulation";

    // iOS pinch: block gesture*. Desktop: ctrl/⌘ zoom.
    const blockGesture = (e: Event) => e.preventDefault();
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
    document.addEventListener("wheel", blockWheelZoom, opts);
    document.addEventListener("keydown", blockKeyZoom);

    return () => {
      rootEl.style.touchAction = prevTouchAction;
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
      document.removeEventListener("gestureend", blockGesture);
      document.removeEventListener("wheel", blockWheelZoom);
      document.removeEventListener("keydown", blockKeyZoom);
    };
  }, []);

  return null;
}
