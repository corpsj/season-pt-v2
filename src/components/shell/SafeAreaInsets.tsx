"use client";
import { useEffect } from "react";

/**
 * Device-agnostic safe-area insets.
 *
 * `env(safe-area-inset-*)` is the correct PER-DEVICE source (iPhone home indicator,
 * Android gesture pill, notches…) — but Android **3-button navigation reports 0**,
 * which is why a fixed fallback was ever needed. A blanket `max(env, 64px)` would wrongly
 * force 64px even on devices that report a smaller real inset (iPhone 34, gesture ~24).
 *
 * So at runtime we read the REAL env values and apply them exactly when present; the
 * fixed fallback is used ONLY when the OS reports 0 inside a standalone (installed) PWA
 * — i.e. the 3-button-nav case. iPhone / gesture-nav devices stay pixel-exact.
 *
 * Sets `--safe-t` / `--safe-b` as inline vars on <html>, overriding the CSS defaults in
 * globals.css (which stay as a safe, no-clip default for the pre-hydration frame).
 */
export function SafeAreaInsets() {
  useEffect(() => {
    const root = document.documentElement;

    // Resolve an env() length to pixels by measuring a hidden probe element.
    const readEnv = (name: string): number => {
      const el = document.createElement("div");
      el.style.cssText =
        `position:fixed;top:0;left:0;width:0;visibility:hidden;pointer-events:none;height:env(${name})`;
      document.body.appendChild(el);
      const px = el.getBoundingClientRect().height;
      el.remove();
      return px;
    };

    const apply = () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      const b = readEnv("safe-area-inset-bottom");
      const t = readEnv("safe-area-inset-top");
      // > 0.5 to ignore sub-pixel noise. Fallback only for the env=0 standalone case.
      root.style.setProperty("--safe-b", b > 0.5 ? `${b}px` : standalone ? "64px" : "0px");
      root.style.setProperty("--safe-t", t > 0.5 ? `${t}px` : standalone ? "32px" : "0px");
    };

    apply();
    // Re-measure if the system bars change (rotation, foldables, browser↔installed).
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  return null;
}
