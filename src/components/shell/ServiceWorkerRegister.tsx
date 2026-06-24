"use client";
import { useEffect } from "react";

/**
 * Registers the minimal network-only service worker (`/sw.js`). Its only purpose is to
 * make Android Chrome fire `beforeinstallprompt` so the one-tap install button reliably
 * appears (Chrome still requires a SW with a fetch handler for that event). The SW does
 * not cache app assets, so the app keeps loading fresh on every visit.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* registration failures are non-fatal */
      });
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
