"use client";
import { useEffect, useState } from "react";

/**
 * Thin top banner shown while the browser reports no network. Purely reactive to the
 * `online`/`offline` events — the network-only service worker caches nothing, so there
 * is no offline app; this just tells the user why things stopped loading. Mounted once
 * in the root layout so it covers both the mobile shell and the desktop console.
 */
export function OfflineBanner() {
  // Start optimistic (online) so SSR/first paint matches the common case; the effect
  // corrects it on mount if we loaded while already offline.
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{ paddingTop: "var(--safe-t)" }}
      className="fixed inset-x-0 top-0 z-[95] bg-terracotta text-center text-[12px] font-semibold text-surface shadow-toast"
    >
      <span className="block px-4 py-1.5">네트워크 연결을 확인해 주세요</span>
    </div>
  );
}
