"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

/**
 * 매출 가리기 — blur money figures so they aren't read over the owner's shoulder
 * while the console is left on a screen in the studio. Per-device, persisted to
 * localStorage. State lives client-side; <Money> reads it, <PrivacyToggle> flips it.
 */
const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({
  hidden: false,
  toggle: () => {},
});

const KEY = "spt_console_priv";

export function PrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(localStorage.getItem(KEY) === "1");
  }, []);
  const toggle = useCallback(() => {
    setHidden((h) => {
      const next = !h;
      localStorage.setItem(KEY, next ? "1" : "0");
      return next;
    });
  }, []);
  return <PrivacyContext.Provider value={{ hidden, toggle }}>{children}</PrivacyContext.Provider>;
}

export const usePrivacy = () => useContext(PrivacyContext).hidden;
export const usePrivacyToggle = () => useContext(PrivacyContext).toggle;

/** Wrap a money figure (already-formatted string) so it can be blurred on demand. */
export function Money({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const hidden = usePrivacy();
  return (
    <span
      className={`transition-[filter] duration-200 ${hidden ? "select-none blur-[7px]" : ""} ${className}`}
    >
      {children}
    </span>
  );
}

/** The pill/switch the owner taps to toggle 매출 가리기. */
export function PrivacyToggle() {
  const hidden = usePrivacy();
  const toggle = usePrivacyToggle();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={hidden}
      className="relative h-[28px] w-[48px] flex-none rounded-full transition-colors"
      style={{ background: hidden ? "#768c6a" : "#e0d9cc" }}
    >
      <span
        className="absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all"
        style={{ left: hidden ? 23 : 3 }}
      />
    </button>
  );
}
