"use client";
import { createContext, useCallback, useContext, useState } from "react";

/**
 * 매출 가리기 — blur money figures so they aren't read over the owner's shoulder
 * while the console is left on a screen in the studio. Per-device, persisted to
 * localStorage. State lives client-side; <Money> reads it, <PrivacyToggle> flips it.
 */
const PrivacyContext = createContext<{ hidden: boolean; toggle: () => void }>({
  hidden: false,
  toggle: () => {},
});

export const PRIVACY_COOKIE = "spt_console_priv";

// 쿠키로 SSR 초기값을 받아 첫 페인트부터 올바른 blur 상태 → 실금액 깜빡 노출(FOUC) 방지.
export function PrivacyProvider({ initialHidden = false, children }: { initialHidden?: boolean; children: React.ReactNode }) {
  const [hidden, setHidden] = useState(initialHidden);
  const toggle = useCallback(() => {
    setHidden((h) => {
      const next = !h;
      document.cookie = `${PRIVACY_COOKIE}=${next ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
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
