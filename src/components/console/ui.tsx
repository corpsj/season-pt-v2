import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/icon";

/* ============================================================
   Console presentational primitives (desktop owner console).
   Universal (no hooks) so both server pages and client islands
   can render them. Mirrors 대표 콘솔 (PC).dc.html.
   ============================================================ */

export const CARD_SHADOW =
  "0 1px 2px rgba(75,59,46,.04), 0 14px 30px -22px rgba(75,59,46,.3)";

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
      className={`rounded-[18px] border border-[rgba(75,59,46,0.06)] bg-white ${className}`}
      style={{ boxShadow: CARD_SHADOW, ...style }}
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
  className?: string;
  title?: string;
  "aria-label"?: string;
};

function Btn({ base, icon, children, href, onClick, type = "button", disabled, className = "", title, ...rest }: BtnBase & { base: string }) {
  const cls = `${base} ${className}`;
  const inner = (
    <>
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} title={title} {...rest}>
        {inner}
      </Link>
    );
  }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={cls} title={title} {...rest}>
      {inner}
    </button>
  );
}

const PBTN =
  "inline-flex items-center justify-center gap-[7px] rounded-[12px] bg-sage px-4 py-[11px] text-[14px] font-semibold tracking-[-0.01em] text-white transition hover:brightness-[1.06] active:scale-[.98] disabled:opacity-50";
const OBTN =
  "inline-flex items-center justify-center gap-[6px] rounded-[12px] border-[1.4px] border-[rgba(107,120,94,0.4)] bg-white px-4 py-[11px] text-[13.5px] font-semibold text-[#5B6452] transition hover:bg-[#F4F0E8] active:scale-[.98] disabled:opacity-50";
const GBTN =
  "inline-flex items-center justify-center gap-[6px] rounded-[10px] border border-[rgba(75,59,46,0.12)] bg-white px-[13px] py-[8px] text-[13px] font-semibold text-[#766D60] transition hover:bg-[#F4F0E8] disabled:opacity-50";

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
  return (
    <div
      onClick={onClose}
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
        {footer ? <div className="mt-1 flex gap-[9px]">{footer}</div> : null}
      </div>
    </div>
  );
}
