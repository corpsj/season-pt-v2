"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { Card, OBtn, GBtn, pill } from "@/components/console/ui";
import { confirmAttendance, revertAttendance } from "@/lib/data/groups/scheduling-actions";
import type { StudioCalendarMonth, StudioClass } from "@/lib/data/groups/console";

const WD = ["월", "화", "수", "목", "금", "토", "일"];

function shortTime(t: string): string {
  return t.replace(/^오전 |^오후 /, "");
}
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const wd = ["일", "월", "화", "수", "목", "금", "토"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${wd})`;
}
function statusPill(c: StudioClass) {
  if (c.status === "attended") return <span style={pill("#5C9166", "#EDF4E3")}>출석</span>;
  if (c.status === "noshow") return <span style={pill("#C67352", "#FBF3E9")}>노쇼</span>;
  if (c.status === "cancelled") return <span style={pill("#8C8475", "#EFEAE1")}>취소</span>;
  return <span style={pill("#847A66", "#F4EFE6")}>예정</span>;
}

export function CalendarClient({ month }: { month: StudioCalendarMonth }) {
  const router = useRouter();
  const toast = useToast();
  const [active, setActive] = useState<string>("all");
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  function go(off: number) {
    router.push(`/console/calendar?m=${off}`);
  }
  const match = (c: StudioClass) => active === "all" || c.trainerId === active;
  function classesOn(iso: string): StudioClass[] {
    return (month.byDate[iso] ?? []).filter(match);
  }

  async function mark(id: string, action: "attend" | "noshow") {
    setBusy(id);
    const r = await confirmAttendance(id, action);
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "처리에 실패했어요");
    toast(action === "attend" ? "출석 처리했어요" : "노쇼 처리했어요");
    router.refresh();
  }

  // 오처리 정정(감사 H1): 예정 상태로 되돌리고 차감된 회차를 복구한다.
  async function revert(id: string) {
    if (typeof window !== "undefined" && !window.confirm("이 수업 처리를 되돌릴까요? 차감된 회차가 복구되고 '예정' 상태로 돌아가요.")) return;
    setBusy(id);
    const r = await revertAttendance(id);
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "되돌리지 못했어요");
    toast("처리를 되돌렸어요");
    router.refresh();
  }

  const modalClasses = day ? classesOn(day) : [];

  return (
    <>
      {/* toolbar */}
      <div className="mb-4 flex items-center gap-3.5">
        <div className="flex items-center gap-1">
          <button onClick={() => go(month.offset - 1)} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white text-[#5B5345] transition hover:bg-[#F4F0E8]"><Icon name="chevron-left" size={18} /></button>
          <button onClick={() => go(0)} className="h-9 rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white px-3.5 text-[13px] font-semibold text-[#5B5345] transition hover:bg-[#F4F0E8]">오늘</button>
          <button onClick={() => go(month.offset + 1)} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white text-[#5B5345] transition hover:bg-[#F4F0E8]"><Icon name="chevron-right" size={18} /></button>
        </div>
        <div>
          <div className="text-[18px] font-bold text-ink">{month.monthLabel}</div>
          <div className="text-[12px] font-medium text-[#9A917F]">이번 달 수업 {month.monthTotal}건</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="mr-0.5 text-[12px] font-semibold text-[#9A917F]">트레이너</span>
          {[{ id: "all", name: "전체", color: "" }, ...month.trainers].map((t) => {
            const on = active === t.id;
            return (
              <button key={t.id} onClick={() => setActive(t.id)} className={`inline-flex items-center gap-1.5 rounded-[9px] px-3 py-[7px] text-[12.5px] font-semibold transition ${on ? "bg-ink text-white" : "border border-[rgba(75,59,46,0.1)] bg-white text-[#766D60]"}`}>
                {t.color ? <span className="h-2 w-2 rounded-[3px]" style={{ background: t.color }} /> : null}
                {t.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* month board */}
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[rgba(75,59,46,0.08)]">
          {WD.map((w, i) => (
            <div key={w} className={`py-[11px] text-center text-[11.5px] font-semibold ${i >= 5 ? "text-[#B89A5E]" : "text-[#9A917F]"}`}>{w}</div>
          ))}
        </div>
        {month.weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-[rgba(75,59,46,0.06)] last:border-b-0">
            {week.map((cell, ci) => {
              if (cell.date == null) return <div key={ci} className="min-h-[120px] border-l border-[rgba(75,59,46,0.05)] first:border-l-0" />;
              const cls = classesOn(cell.dateISO);
              const live = cls.filter((c) => c.status !== "cancelled");
              return (
                <button
                  key={ci}
                  onClick={() => setDay(cell.dateISO)}
                  className="min-h-[120px] border-l border-[rgba(75,59,46,0.05)] p-[7px] pb-[9px] text-left transition first:border-l-0 hover:brightness-[0.985]"
                  style={{ background: cell.isToday ? "#F3F7EC" : "transparent" }}
                >
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-[7px] px-1.5 text-[12.5px] font-bold" style={cell.isToday ? { color: "#FAF8F4", background: "#768C6A" } : { color: cell.isSunday ? "#C0796A" : cell.isSaturday ? "#B89A5E" : "#5B5345" }}>{cell.date}</span>
                    {live.length > 0 ? <span className="text-[10px] font-semibold text-[#B3AA9C]">{live.length}</span> : null}
                  </div>
                  <div className="flex flex-col gap-[3px]">
                    {cls.slice(0, 3).map((c) => (
                      <div key={c.sessionId} className="flex items-center gap-1 overflow-hidden rounded-[5px] px-1.5 py-[3px]" style={{ background: c.status === "cancelled" ? "#F1ECE2" : c.color + "1f", opacity: c.status === "cancelled" ? 0.6 : 1 }}>
                        <span className="flex-none text-[9.5px] font-bold" style={{ color: c.color }}>{shortTime(c.start)}</span>
                        <span className="min-w-0 flex-1 truncate text-[10.5px] font-semibold text-ink">{c.member}</span>
                      </div>
                    ))}
                    {cls.length > 3 ? <div className="px-1.5 pt-0.5 text-[10px] font-bold text-sage-deep">+{cls.length - 3}</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </Card>

      {/* day modal */}
      {day ? (
        <div onClick={() => setDay(null)} className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(38,35,30,0.42)] p-5">
          <div onClick={(e) => e.stopPropagation()} className="flex max-h-[84vh] w-[470px] flex-col overflow-hidden rounded-[20px] bg-white" style={{ boxShadow: "0 24px 60px -16px rgba(38,35,30,0.5)" }}>
            <div className="flex items-center justify-between border-b border-[rgba(75,59,46,0.07)] px-[22px] pb-[15px] pt-5">
              <div>
                <div className="text-[17px] font-bold tracking-[-0.01em] text-ink">{dayLabel(day)}</div>
                <div className="mt-0.5 text-[12px] font-medium text-[#9A917F]">수업 {modalClasses.filter((c) => c.status !== "cancelled").length}건</div>
              </div>
              <button onClick={() => setDay(null)} className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#F4EFE6] text-[#766D60]"><Icon name="close" size={16} /></button>
            </div>
            <div className="overflow-y-auto px-4 pb-3.5 pt-1.5">
              {modalClasses.length > 0 ? (
                modalClasses.map((c) => (
                  <div key={c.sessionId} className="flex items-center gap-3 border-b border-[rgba(75,59,46,0.05)] px-1.5 py-3 last:border-b-0">
                    <div className="w-[58px] flex-none">
                      <div className="text-[13.5px] font-bold text-ink">{c.start}</div>
                      <div className="mt-px text-[10px] font-medium text-[#A89F92]">{c.end}</div>
                    </div>
                    <div className="h-[38px] w-[3px] flex-none rounded-[2px]" style={{ background: c.color }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-bold text-ink">{c.member}{c.isTeam ? " · 2:1" : ""}</div>
                      <div className="text-[11px] font-medium text-[#9A917F]">{c.trainerName}</div>
                    </div>
                    {c.showAttend ? (
                      <div className="flex flex-none gap-1.5">
                        <OBtn className="!px-3 !py-[7px] text-[12.5px]" disabled={busy === c.sessionId} onClick={() => mark(c.sessionId, "attend")}>출석</OBtn>
                        <GBtn disabled={busy === c.sessionId} onClick={() => mark(c.sessionId, "noshow")}>노쇼</GBtn>
                      </div>
                    ) : c.status === "attended" || c.status === "noshow" || c.status === "cancelled" ? (
                      <div className="flex flex-none items-center gap-2">
                        {statusPill(c)}
                        <button
                          type="button"
                          disabled={busy === c.sessionId}
                          onClick={() => revert(c.sessionId)}
                          className="text-[11.5px] font-semibold text-[#9A917F] underline underline-offset-2 disabled:opacity-40"
                        >
                          되돌리기
                        </button>
                      </div>
                    ) : (
                      statusPill(c)
                    )}
                  </div>
                ))
              ) : (
                <div className="px-5 py-12 text-center">
                  <div className="text-[13.5px] font-semibold text-[#847A66]">예정된 수업이 없어요</div>
                  <div className="mt-1.5 text-[12px] font-medium text-[#A89F92]">이 날은 비어 있어요</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
