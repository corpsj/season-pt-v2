"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Mobile-only "add to home screen" nudge. This app is meant to be installed.
 * - Android (Chromium): captures `beforeinstallprompt` → one-tap 설치 (menu-instruction
 *   fallback if the event never fires).
 * - iOS: Apple exposes NO install API, so a focused guided overlay (dimmed backdrop +
 *   numbered steps + share glyph + bouncing arrow toward the toolbar) is the best UX.
 * - In-app browsers (KakaoTalk/Instagram/…): A2HS isn't available → direct to the real
 *   browser, with a Web-Share/copy action that bakes in the "open in Safari" hint.
 * Hidden when standalone or on desktop. Dismissible (7-day snooze). No service worker.
 */
type BIPEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type Mode = "android-prompt" | "android-manual" | "ios" | "inapp" | null;
const SNOOZE_KEY = "spt_a2hs_dismissed_at";
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const IN_APP_RE = /KAKAOTALK|Instagram|NAVER|FBAN|FBAV|FB_IAB|Line\/|DaumApps|Band|; wv\)/i;
// Baked into every share/copy so links opened in an in-app/Chrome land in Safari.
const SHARE_HINT = "아이폰은 Safari로 이 링크를 열고 ‘공유 → 홈 화면에 추가’로 설치하세요.";

export function InstallPrompt() {
  const [mode, setMode] = useState<Mode>(null);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
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
    const isInApp = IN_APP_RE.test(ua);

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

    const t = setTimeout(
      () => {
        if (fired.current) return;
        setMode(isInApp ? "inapp" : isIOS ? "ios" : "android-manual");
      },
      isAndroid && !isInApp ? 2500 : 1000
    );

    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (mode) {
      const r = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(r);
    }
  }, [mode]);

  if (!mode) return null;

  const close = (snooze: boolean) => {
    if (snooze) localStorage.setItem(SNOOZE_KEY, String(Date.now()));
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
    close(true);
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareApp = async () => {
    const url = window.location.origin;
    const text = `계절 PT & 필라테스\n${SHARE_HINT}`;
    if (canShare) {
      try {
        await navigator.share({ title: "계절 PT & 필라테스", text, url });
        return;
      } catch {
        /* user cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  };
  const shareLabel = copied ? "복사됨!" : canShare ? "링크 보내기" : "링크 복사";

  const focus = mode === "ios" || mode === "inapp";

  return (
    <>
      {/* dimmed backdrop focuses attention on the guide (iOS / in-app) */}
      {focus ? (
        <div
          onClick={() => close(true)}
          aria-hidden="true"
          className={cn(
            "fixed inset-0 z-[55] bg-ink/45 transition-opacity duration-300",
            shown ? "opacity-100" : "opacity-0"
          )}
        />
      ) : null}

      <div
        className="fixed inset-x-0 z-[60] flex flex-col items-center px-3"
        style={{ bottom: "calc(var(--safe-b, 0px) + 10px)" }}
        role="dialog"
        aria-label="앱 설치 안내"
      >
        <div
          className={cn(
            "w-full max-w-[420px] overflow-hidden rounded-[18px] border border-ink/[0.08] bg-card",
            "shadow-[0_10px_40px_rgba(38,35,30,0.28)] transition-all duration-300",
            shown ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
          )}
        >
          {/* header */}
          <div className="flex items-center gap-3 px-3.5 pt-3.5">
            <img
              src="/brand/icon-192.png"
              alt=""
              className="h-11 w-11 flex-none rounded-[12px] border border-ink/[0.06]"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold text-ink">
                {mode === "inapp" ? "브라우저에서 설치하기" : "홈 화면에 추가"}
              </div>
              <div className="mt-0.5 text-[12px] leading-[1.5] text-muted2">
                앱처럼 전체화면으로 더 빠르게 열려요.
              </div>
            </div>
            {mode === "android-prompt" ? (
              <button
                type="button"
                onClick={install}
                className="tappable flex-none rounded-[11px] bg-sage px-3.5 py-2 text-[13px] font-bold text-surface active:scale-95"
              >
                설치
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => close(true)}
              aria-label="닫기"
              className="tappable -mr-1 flex-none self-start rounded-full p-1 text-chevron active:scale-90"
            >
              <Icon name="close" size={18} />
            </button>
          </div>

          {/* body per mode */}
          {mode === "ios" ? (
            <>
              <ol className="mt-2.5 flex flex-col gap-2 border-t border-ink/[0.06] px-3.5 py-3">
                <Step n={1}>
                  하단 <ShareGlyph /> <b className="font-bold text-ink">공유</b> 버튼을 누르세요
                </Step>
                <Step n={2}>
                  <b className="font-bold text-ink">‘홈 화면에 추가’</b>를 선택하세요
                </Step>
                <Step n={3}>
                  오른쪽 위 <b className="font-bold text-ink">‘추가’</b>를 누르면 끝!
                </Step>
              </ol>
              <button
                type="button"
                onClick={shareApp}
                className="tappable w-full border-t border-ink/[0.06] py-2.5 text-[12px] font-semibold text-sage-deep active:bg-sage-banner2/50"
              >
                {copied ? "복사됨!" : "다른 사람에게 보내기 (Safari 안내 포함)"}
              </button>
            </>
          ) : mode === "android-manual" ? (
            <div className="mt-2.5 border-t border-ink/[0.06] px-3.5 py-3 text-[12.5px] leading-[1.55] text-muted2">
              브라우저 메뉴 <b className="font-bold text-ink">⋮</b> →{" "}
              <b className="font-bold text-ink">‘앱 설치’</b> 또는{" "}
              <b className="font-bold text-ink">‘홈 화면에 추가’</b>를 눌러주세요.
            </div>
          ) : mode === "inapp" ? (
            <div className="mt-2.5 flex items-center gap-2.5 border-t border-ink/[0.06] px-3.5 py-3">
              <div className="flex-1 text-[12.5px] leading-[1.55] text-muted2">
                이 화면에선 설치할 수 없어요. 메뉴에서{" "}
                <b className="font-bold text-ink">‘다른 브라우저(Safari/Chrome)로 열기’</b> 후
                설치해 주세요.
              </div>
              <button
                type="button"
                onClick={shareApp}
                className={cn(
                  "tappable flex-none rounded-[11px] px-3 py-2 text-[12.5px] font-bold active:scale-95",
                  copied ? "bg-sage-banner2 text-sage-deep" : "bg-sage text-surface"
                )}
              >
                {shareLabel}
              </button>
            </div>
          ) : null}
        </div>

        {/* bouncing arrow → Safari/Chrome toolbar (iOS guided only) */}
        {mode === "ios" ? (
          <Icon name="chevron-down" size={30} className="mt-1.5 animate-bounce text-surface drop-shadow" />
        ) : null}
      </div>
    </>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px flex h-[18px] w-[18px] flex-none items-center justify-center rounded-full bg-sage text-[11px] font-bold text-surface">
        {n}
      </span>
      <span className="text-[12.5px] leading-[1.5] text-muted2">{children}</span>
    </li>
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
