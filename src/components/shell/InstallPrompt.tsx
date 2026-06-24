"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Mobile-only "add to home screen" nudge. This app is meant to be installed.
 * - Android (Chromium): captures `beforeinstallprompt` → one-tap 설치 (falls back to
 *   menu instructions if the event never fires).
 * - iOS: there is no install API → shows 공유 → '홈 화면에 추가' instructions.
 * Hidden when already installed (standalone) or on desktop. Dismissible (7-day snooze).
 * No service worker is used (kept out by design); install still works on modern browsers.
 */
type BIPEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "android-prompt" | "android-manual" | "ios" | null;
const SNOOZE_KEY = "spt_a2hs_dismissed_at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);
  const [shown, setShown] = useState(false);
  const deferred = useRef<BIPEvent | null>(null);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return;

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    if (!isIOS && !isAndroid) return; // mobile only

    const last = Number(localStorage.getItem(SNOOZE_KEY) || 0);
    if (last && Date.now() - last < SNOOZE_MS) return;

    const fired = { current: false };
    const onBIP = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BIPEvent;
      fired.current = true;
      setMode("android-prompt");
    };
    const onInstalled = () => {
      localStorage.setItem(SNOOZE_KEY, String(Date.now()));
      setShown(false);
      setTimeout(() => setMode(null), 250);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);

    // If the native prompt never arrives, fall back to platform instructions.
    const t = setTimeout(
      () => {
        if (!fired.current) setMode(isIOS ? "ios" : "android-manual");
      },
      isAndroid ? 2500 : 1200
    );

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // slide-in once a mode is chosen
  useEffect(() => {
    if (mode) {
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
  }, [mode]);

  if (!mode) return null;

  const snooze = () => {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    setShown(false);
    setTimeout(() => setMode(null), 250);
  };
  const install = async () => {
    const ev = deferred.current;
    if (!ev) return;
    ev.prompt();
    try {
      await ev.userChoice;
    } catch {
      /* ignore */
    }
    deferred.current = null;
    snooze();
  };

  return (
    <div
      className="fixed inset-x-0 z-[60] flex justify-center px-3"
      style={{ bottom: "calc(var(--safe-b, 0px) + 14px)" }}
      role="dialog"
      aria-label="앱 설치 안내"
    >
      <div
        className={cn(
          "w-full max-w-[420px] overflow-hidden rounded-[18px] border border-ink/[0.08] bg-card",
          "shadow-[0_10px_34px_rgba(38,35,30,0.20)] transition-all duration-300",
          shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
        )}
      >
        <div className="flex items-start gap-3 p-3.5">
          {/* brand icon */}
          <img
            src="/brand/icon-192.png"
            alt=""
            className="h-11 w-11 flex-none rounded-[12px] border border-ink/[0.06]"
          />

          <div className="min-w-0 flex-1">
            {mode === "android-prompt" ? (
              <>
                <div className="text-[14px] font-bold text-ink">홈 화면에 추가</div>
                <div className="mt-0.5 text-[12px] leading-[1.5] text-muted2">
                  앱처럼 전체화면으로 더 빠르게 열려요.
                </div>
              </>
            ) : mode === "android-manual" ? (
              <>
                <div className="text-[14px] font-bold text-ink">앱으로 설치하기</div>
                <div className="mt-1 text-[12.5px] leading-[1.55] text-muted2">
                  브라우저 메뉴 <b className="font-bold text-ink">⋮</b> →{" "}
                  <b className="font-bold text-ink">‘앱 설치’</b> 또는{" "}
                  <b className="font-bold text-ink">‘홈 화면에 추가’</b>를 눌러주세요.
                </div>
              </>
            ) : (
              <>
                <div className="text-[14px] font-bold text-ink">홈 화면에 추가</div>
                <div className="mt-1 text-[12.5px] leading-[1.55] text-muted2">
                  하단 <ShareGlyph /> <b className="font-bold text-ink">공유</b> →{" "}
                  <b className="font-bold text-ink">‘홈 화면에 추가’</b>를 선택하세요.
                </div>
              </>
            )}
          </div>

          {/* actions */}
          {mode === "android-prompt" ? (
            <button
              type="button"
              onClick={install}
              className="tappable flex-none self-center rounded-[11px] bg-sage px-3.5 py-2 text-[13px] font-bold text-surface active:scale-95"
            >
              설치
            </button>
          ) : null}
          <button
            type="button"
            onClick={snooze}
            aria-label="닫기"
            className="tappable -mr-1 -mt-1 flex-none rounded-full p-1 text-chevron active:scale-90"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** iOS share glyph (square tray + up arrow). */
function ShareGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="inline-block -translate-y-[1px] align-text-bottom text-sage-deep"
      aria-hidden="true"
    >
      <path d="M12 15V4M12 4 8.5 7.5M12 4l3.5 3.5" />
      <path d="M6 12H5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
    </svg>
  );
}
