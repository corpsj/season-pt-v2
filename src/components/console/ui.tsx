import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/Button";

/* ============================================================
   Console presentational primitives (desktop owner console).
   Universal (no hooks) so both server pages and client islands
   can render them. Mirrors 대표 콘솔 (PC).dc.html.
   ============================================================ */

/** ₩ with thousands separators (ko-KR). */
export function won(n: number): string {
  return "₩" + Math.round(n).toLocaleString("ko-KR");
}

/** "2026. 6. 25 (목)" — KST today, display only. */
export function kstTodayLabel(): string {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][d.getUTCDay()];
  return `${d.getUTCFullYear()}. ${d.getUTCMonth() + 1}. ${d.getUTCDate()} (${wd})`;
}

export function Card({
  children,
  className = "",
  style,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={`rounded-[18px] border border-ink/[0.06] bg-white shadow-card ${className}`}
      style={style}
    >
      {children}
    </div>
  );
}

type BtnBase = {
  children?: React.ReactNode;
  icon?: IconName;
  href?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  /** 제출 중: 스피너 표시 + 클릭 차단. 라벨은 유지된다. */
  pending?: boolean;
  className?: string;
  title?: string;
  "aria-label"?: string;
};

function Btn({ base, icon, children, href, onClick, type = "button", disabled, pending, className = "", title, ...rest }: BtnBase & { base: string }) {
  const cls = `${base} ${disabled ? "opacity-50" : pending ? "opacity-80" : ""} ${className}`;
  const inner = (
    <>
      {pending ? <Spinner size={16} /> : icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </>
  );
  if (href && !pending) {
    return (
      <Link href={href} className={cls} title={title} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled || pending} aria-busy={pending || undefined} className={cls} title={title} {...rest}>
      {inner}
    </button>
  );
}

// 모바일 버튼과 동일한 디자인 축: radius 15/13(--radius-btn/field), .tappable 모션, sage 포커스 링.
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage/40";
const PBTN =
  `inline-flex items-center justify-center gap-[7px] rounded-[15px] bg-sage px-4 py-[11px] text-[14px] font-semibold tracking-[-0.01em] text-white transition-[filter,transform] duration-[130ms] hover:brightness-[1.06] active:scale-[.975] ${FOCUS}`;
const OBTN =
  `inline-flex items-center justify-center gap-[6px] rounded-[15px] border-[1.4px] border-sage-deep/40 bg-white px-4 py-[11px] text-[13.5px] font-semibold text-[#5B6452] transition-[background-color,transform] duration-[130ms] hover:bg-[#F4F0E8] active:scale-[.975] ${FOCUS}`;
const GBTN =
  `inline-flex items-center justify-center gap-[6px] rounded-[13px] border border-ink/[0.12] bg-white px-[13px] py-[8px] text-[13px] font-semibold text-[#766D60] transition-[background-color,transform] duration-[150ms] hover:bg-[#F4F0E8] active:scale-[.975] ${FOCUS}`;

export function PBtn(p: BtnBase) {
  return <Btn base={PBTN} {...p} />;
}
export function OBtn(p: BtnBase) {
  return <Btn base={OBTN} {...p} />;
}
export function GBtn(p: BtnBase) {
  return <Btn base={GBTN} {...p} />;
}

/** Section card header (title + optional right slot). */
export function CardHead({
  title,
  count,
  right,
  className = "",
}: {
  title: React.ReactNode;
  count?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[16px] font-bold text-ink">{title}</span>
      {count != null ? <span className="text-[12px] font-medium text-[#9A917F]">{count}</span> : null}
      {right != null ? <span className="ml-auto">{right}</span> : null}
    </div>
  );
}

/** D-day / 만료 pill matching the design palette. */
export function DPill({ dDay }: { dDay: number | null }) {
  if (dDay == null)
    return <span style={pill("#8C8475", "#EFEAE1")}>만료</span>;
  if (dDay <= 14) return <span style={pill("#B5612F", "#FBF3E9")}>D-{dDay}</span>;
  return <span style={pill("#5B6452", "#EDF4E3")}>D-{dDay}</span>;
}

export function pill(color: string, bg: string): React.CSSProperties {
  return {
    font: "700 11px Pretendard",
    color,
    background: bg,
    padding: "3px 9px",
    borderRadius: 7,
    whiteSpace: "nowrap",
    display: "inline-block",
  };
}

/** Uppercase muted micro-label (운동 기록 / 최근 출석 등). */
export function MicroLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A89F92] ${className}`}>
      {children}
    </div>
  );
}

/** Centered modal dialog matching the console design. onClose fires on overlay/✕. */
export function ConsoleModal({
  title,
  onClose,
  children,
  footer,
  width = 420,
}: {
  title: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  // 배경 클릭은 "누르기 시작한 곳도 배경일 때"만 닫는다 — 셀 안에서 텍스트를 드래그하다
  // 배경에서 손을 떼도 닫히지 않게. (이 파일은 서버 컴포넌트에서도 import되므로 hook 대신 DOM dataset 사용)
  return (
    <div
      onMouseDown={(e) => { e.currentTarget.dataset.pressSelf = String(e.target === e.currentTarget); }}
      onClick={(e) => { if (e.target === e.currentTarget && e.currentTarget.dataset.pressSelf === "true") onClose(); }}
      className="fixed inset-0 z-[70] flex items-center justify-center bg-[rgba(38,35,30,0.42)] p-5"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[86vh] overflow-y-auto rounded-[20px] bg-white p-6"
        style={{ width, boxShadow: "0 24px 60px -16px rgba(38,35,30,0.5)" }}
      >
        <div className="mb-[18px] flex items-center justify-between">
          <span className="text-[17px] font-bold text-ink">{title}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#F4EFE6] text-[#766D60] transition hover:brightness-95"
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
        {footer ? <div className="mt-5 flex gap-[9px] border-t border-[rgba(75,59,46,0.08)] pt-[18px]">{footer}</div> : null}
      </div>
    </div>
  );
}
