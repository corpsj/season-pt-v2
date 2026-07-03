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
  const [pull, setPull] = useState(0);
  const [refreshing, startTransition] = useTransition();

  function onTouchStart(e: React.TouchEvent) {
    const el = ref.current;
    if (!el || el.scrollTop > 0) return;
    const t = e.target as Element;
    // 시트·모달(fixed 오버레이)이나 내부 스크롤 영역에서 시작한 터치는 무시
    if (t.closest(".fixed")) return;
    const scrollable = t.closest(".overflow-y-auto");
    if (scrollable && scrollable !== el) return;
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current == null) return;
    const el = ref.current;
    if (!el) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy <= 0 || el.scrollTop > 0) {
      if (pull !== 0) setPull(0);
      return;
    }
    setPull(Math.min(72, dy * 0.35));
  }
  function onTouchEnd() {
    if (startY.current == null) return;
    startY.current = null;
    if (pull >= PULL_TRIGGER) startTransition(() => router.refresh());
    setPull(0);
  }

  const indicator = refreshing ? 40 : pull;
  return (
    <div
      ref={ref}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      className={cn("no-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-y-contain", PAD[pad], className)}
    >
      {indicator > 0 ? (
        <div
          style={{ height: indicator }}
          className={cn(
            "flex flex-none items-center justify-center overflow-hidden text-sage",
            refreshing && "transition-[height] duration-150"
          )}
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
