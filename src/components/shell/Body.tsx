"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { Spinner } from "@/components/ui/Button";

type Pad = "list" | "form" | "wide" | "none";
const PAD: Record<Pad, string> = {
  list: "px-[18px] pt-2", // tab/list screens
  form: "px-[22px] pt-2", // login/forms
  wide: "px-6 pt-2", // onboarding
  none: "",
};
const FOOTER_PAD: Record<Pad, string> = {
  list: "px-[18px]",
  form: "px-[22px]",
  wide: "px-6",
  none: "",
};

// 당김 거리(px, 감쇠 후)가 이 값을 넘으면 손을 뗄 때 새로고침한다.
const PULL_TRIGGER = 40;

/** Scrollable screen body (scrollbar hidden) + 당겨서 새로고침. */
export function Body({
  children,
  className,
  pad = "list",
}: {
  children: React.ReactNode;
  className?: string;
  pad?: Pad;
}) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0); // 네이티브 리스너가 최신 당김 거리를 참조·판정하도록
  const moveRef = useRef<((e: TouchEvent) => void) | null>(null);
  const [pull, setPull] = useState(0);
  const [refreshing, startTransition] = useTransition();

  const setPullVal = (v: number) => {
    pullRef.current = v;
    setPull(v);
  };

  function detachMove() {
    const el = ref.current;
    if (el && moveRef.current) el.removeEventListener("touchmove", moveRef.current);
    moveRef.current = null;
  }

  function onTouchStart(e: React.TouchEvent) {
    const el = ref.current;
    if (!el || el.scrollTop > 0) return;
    const t = e.target as Element;
    // 시트·모달(fixed 오버레이)이나 내부 스크롤 영역에서 시작한 터치는 무시
    if (t.closest(".fixed")) return;
    const scrollable = t.closest(".overflow-y-auto");
    if (scrollable && scrollable !== el) return;
    startY.current = e.touches[0].clientY;

    // 당기는 동안에만 스크롤러(el)에 non-passive touchmove를 걸어 iOS 고무줄을 preventDefault로
    // 막는다(당김 인디케이터와 이중 스크롤 방지). 제스처 동안만 부착 → 평소 스크롤은 passive 유지.
    detachMove();
    const onMove = (ev: TouchEvent) => {
      if (startY.current == null || !el) return;
      const dy = ev.touches[0].clientY - startY.current;
      // 최상단에서 아래로, 한 손가락으로 당길 때만 고무줄 차단
      if (dy <= 0 || el.scrollTop > 0 || ev.touches.length > 1) {
        if (pullRef.current !== 0) setPullVal(0);
        return;
      }
      ev.preventDefault();
      setPullVal(Math.min(72, dy * 0.35));
    };
    moveRef.current = onMove;
    el.addEventListener("touchmove", onMove, { passive: false });
  }
  function onTouchEnd() {
    detachMove();
    if (startY.current == null) return;
    startY.current = null;
    if (pullRef.current >= PULL_TRIGGER) startTransition(() => router.refresh());
    setPullVal(0);
  }

  const indicator = refreshing ? 40 : pull;
  return (
    <div
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={cn("no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain", PAD[pad], className)}
    >
      {indicator > 0 ? (
        <div
          style={{ height: indicator }}
          className="flex flex-none items-center justify-center overflow-hidden text-sage transition-[height] duration-150"
        >
          <span className={cn(!refreshing && pull < PULL_TRIGGER && "opacity-40")}>
            <Spinner size={18} />
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}

/** Fixed footer area with bottom safe-area inset. */
export function Footer({
  children,
  className,
  pad = "list",
}: {
  children: React.ReactNode;
  className?: string;
  pad?: Pad;
}) {
  return (
    <div className={cn("flex-none pt-3 pb-[max(30px,var(--safe-b))]", FOOTER_PAD[pad], className)}>
      {children}
    </div>
  );
}
