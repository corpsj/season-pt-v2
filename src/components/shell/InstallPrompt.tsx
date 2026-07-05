"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

/**
 * Full-screen INSTALL GATE. This app is meant to be installed, so on a mobile browser
 * (not yet installed) we cover the app and strongly push "add to home screen".
 * - Android (Chromium): one-tap 설치 via `beforeinstallprompt` (needs the network-only
 *   SW from ServiceWorkerRegister); menu-instruction fallback if the event is absent.
 * - iOS: Apple has no install API → guided steps + share glyph + arrow (manual A2HS).
 * - In-app browsers (KakaoTalk/IG/…): A2HS impossible → open in Safari/Chrome + share
 *   (the share/copy text bakes in the "open in Safari" hint).
 * Hidden when already installed (standalone) or on desktop. Re-shown every session;
 * a discreet "그냥 브라우저에서 볼게요" escape (session-only) avoids trapping users.
 */
type BIPEvent = Event & {
  prompt: () => void;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};
type Plat = "android" | "ios" | "inapp" | null;

const SKIP_KEY = "spt_install_skip"; // sessionStorage → continue-in-browser for this session
const IN_APP_RE = /KAKAOTALK|Instagram|NAVER|FBAN|FBAV|FB_IAB|Line\/|DaumApps|Band|; wv\)/i;
const SHARE_TITLE = "계절 PT & 필라테스";
// Readable in a KakaoTalk chat bubble: short intro + per-platform steps on their own lines.
const SHARE_TEXT =
  "계절 PT & 필라테스 앱이에요 🌿\n" +
  "아래 링크로 설치하고 이용해 주세요.\n" +
  "\n" +
  "📱 아이폰 (Safari)\n" +
  "  링크 열기 → 공유 → ‘홈 화면에 추가’\n" +
  "\n" +
  "🤖 안드로이드 (Chrome)\n" +
  "  링크 열기 → 메뉴 ⋮ → ‘앱 설치’";

export function InstallPrompt() {
  const [plat, setPlat] = useState<Plat>(null);
  const [ready, setReady] = useState(false);
  const [copied, setCopied] = useState<false | "ok" | "fail">(false);
  const [canPrompt, setCanPrompt] = useState(false);
  const deferred = useRef<BIPEvent | null>(null);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return;
    if (sessionStorage.getItem(SKIP_KEY)) return;

    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/.test(ua);
    if (!isIOS && !isAndroid) return; // mobile only
    const isInApp = IN_APP_RE.test(ua);

    const platFrame = requestAnimationFrame(() => {
      setPlat(isInApp ? "inapp" : isIOS ? "ios" : "android");
    });

    const onBIP = (e: Event) => {
      e.preventDefault();
      deferred.current = e as BIPEvent;
      setCanPrompt(true);
    };
    const onInstalled = () => {
      sessionStorage.setItem(SKIP_KEY, "1");
      setReady(false);
      setTimeout(() => setPlat(null), 250);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      cancelAnimationFrame(platFrame);
      window.removeEventListener("beforeinstallprompt", onBIP);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (plat) {
      const r = requestAnimationFrame(() => setReady(true));
      return () => cancelAnimationFrame(r);
    }
  }, [plat]);

  if (!plat) return null;

  const skip = () => {
    sessionStorage.setItem(SKIP_KEY, "1");
    setReady(false);
    setTimeout(() => setPlat(null), 250);
  };
  const androidInstall = async () => {
    const ev = deferred.current;
    if (!ev) return;
    ev.prompt();
    try {
      await ev.userChoice;
    } catch {
      /* ignore */
    }
    deferred.current = null;
  };
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  const shareApp = async () => {
    const url = window.location.origin;
    if (canShare) {
      try {
        // url passed separately → the messenger renders a clean link preview below the text
        await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
        return;
      } catch {
        /* cancelled */
      }
    }
    try {
      await navigator.clipboard.writeText(`${SHARE_TEXT}\n\n${url}`);
      setCopied("ok");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied("fail"); // 복사 실패 시 침묵하지 않고 수동 복사 안내
      setTimeout(() => setCopied(false), 2600);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-[100] flex flex-col bg-surface transition-opacity duration-300",
        ready ? "opacity-100" : "opacity-0"
      )}
      style={{ paddingTop: "var(--safe-t, 0px)", paddingBottom: "var(--safe-b, 0px)" }}
      role="dialog"
      aria-modal="true"
      aria-label="앱 설치"
    >
      <div className="flex flex-1 flex-col items-center justify-center break-keep px-7 text-center">
        <Image
          src="/brand/icon-512.png"
          alt=""
          width={88}
          height={88}
          className="h-[88px] w-[88px] rounded-[22px] border border-ink/[0.06] shadow-[0_8px_28px_rgba(38,35,30,0.16)]"
        />
        <h1 className="mt-5 text-[21px] font-bold text-ink">계절 PT &amp; 필라테스</h1>
        <p className="mt-2 text-[13.5px] leading-[1.6] text-muted2">
          앱을 <b className="font-bold text-ink">설치</b>하고 이용해 주세요.
          <br />
          홈 화면에서 전체화면 앱처럼 빠르게 열려요.
        </p>

        <div className="mt-7 w-full max-w-[360px]">
          {plat === "android" ? (
            <>
              {canPrompt ? (
                <>
                  <button
                    type="button"
                    onClick={androidInstall}
                    className="tappable flex w-full items-center justify-center gap-2 rounded-[15px] bg-sage py-[15px] text-[15px] font-bold text-surface shadow-[0_6px_18px_rgba(118,140,106,0.4)] active:scale-[0.98]"
                  >
                    <Icon name="plus-bold" size={18} />
                    설치
                  </button>
                  <p className="mt-2.5 text-[12px] leading-[1.55] text-muted2">
                    버튼을 누른 뒤 뜨는 창에서
                    <br />
                    <b className="font-bold text-ink">‘설치’</b>를 한 번 더 눌러주세요.
                  </p>
                </>
              ) : null}
              <div
                className={cn(
                  "rounded-[16px] border border-ink/[0.08] bg-card p-4 text-left shadow-[0_6px_18px_rgba(38,35,30,0.08)]",
                  canPrompt && "mt-3.5"
                )}
              >
                <div className="mb-2.5 text-[12px] font-bold text-sage-deep">
                  {canPrompt ? "버튼이 안 되면, 크롬 메뉴로 설치하세요" : "크롬에서 설치하는 방법"}
                </div>
                <ol className="flex flex-col gap-2.5">
                  <Step n={1}>
                    오른쪽 위{" "}
                    <Icon
                      name="more-vertical"
                      size={15}
                      className="inline-block -translate-y-px align-text-bottom text-ink"
                    />{" "}
                    <b className="font-bold text-ink">더보기</b> 버튼을 누르세요
                  </Step>
                  <Step n={2}>
                    <b className="font-bold text-ink">‘앱 설치’</b> 또는{" "}
                    <b className="font-bold text-ink">‘홈 화면에 추가’</b>를 누르세요
                  </Step>
                  <Step n={3}>
                    마지막으로 <b className="font-bold text-ink">‘설치’</b>를 누르면 홈 화면에 추가돼요
                  </Step>
                </ol>
              </div>
            </>
          ) : plat === "ios" ? (
            <>
              <div className="rounded-[16px] border border-ink/[0.08] bg-card p-4 text-left shadow-[0_6px_18px_rgba(38,35,30,0.08)]">
                <ol className="flex flex-col gap-2.5">
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
              </div>
              <div className="mt-3 flex flex-col items-center text-[12px] text-muted2">
                <span>아래 공유 버튼을 찾아보세요</span>
                <Icon name="chevron-down" size={26} className="mt-1 animate-bounce text-sage-deep" />
              </div>
              <button
                type="button"
                onClick={shareApp}
                className="tappable mt-1 text-[12px] font-semibold text-sage-deep underline underline-offset-2"
              >
                {copied === "ok" ? "복사됨!" : copied === "fail" ? "복사 실패 — 주소를 길게 눌러 복사해 주세요" : "다른 사람에게 보내기 (Safari 안내 포함)"}
              </button>
            </>
          ) : (
            <>
              <div className="rounded-[16px] border border-ink/[0.08] bg-card p-4 text-left text-[13px] leading-[1.6] text-muted2">
                지금 화면(앱 안의 브라우저)에서는 설치할 수 없어요.
                <br />
                오른쪽 위 <b className="font-bold text-ink">⋯</b> 메뉴에서{" "}
                <b className="font-bold text-ink">‘다른 브라우저(Safari/Chrome)로 열기’</b>를 누른 뒤
                설치해 주세요.
              </div>
              <button
                type="button"
                onClick={shareApp}
                className="tappable mt-3 w-full rounded-[15px] bg-sage py-[14px] text-[14.5px] font-bold text-surface active:scale-[0.98]"
              >
                {copied === "ok" ? "복사됨!" : copied === "fail" ? "복사 실패 — 주소를 길게 눌러 복사해 주세요" : canShare ? "링크 보내기" : "링크 복사"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* discreet escape — re-prompts next session */}
      <button
        type="button"
        onClick={skip}
        className="tappable mx-auto mb-2 px-4 py-2 text-[12px] font-medium text-placeholder underline underline-offset-[3px]"
      >
        그냥 브라우저에서 볼게요
      </button>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-px flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full bg-sage text-[11px] font-bold text-surface">
        {n}
      </span>
      <span className="text-[13px] leading-[1.5] text-muted2">{children}</span>
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
