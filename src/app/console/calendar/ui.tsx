"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, OBtn, GBtn, PBtn, ConsoleModal, MicroLabel, pill } from "@/components/console/ui";
import { Combobox } from "@/components/ui/Select";
import { Stepper } from "@/components/ui/Stepper";
import { confirmAttendance, revertAttendance, sendPropose, moveSessionDirect, saveRecord, loadRecordTarget } from "@/lib/data/groups/scheduling-actions";
import { loadSessionSignature, loadProposeSlots, loadStudioWeek } from "@/lib/data/groups/console-actions";
import type { StudioCalendarMonth, StudioCalendarWeek, StudioClass } from "@/lib/data/groups/console";
import { WeekGrid } from "./WeekGrid";

type ProposeView = NonNullable<Awaited<ReturnType<typeof loadProposeSlots>>>;
type RecordView = NonNullable<Awaited<ReturnType<typeof loadRecordTarget>>>;
type RecExercise = { name: string; kg: number; sets: number };

const WD = ["일", "월", "화", "수", "목", "금", "토"];

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

export function CalendarClient({ month, initialWeek }: { month: StudioCalendarMonth; initialWeek: StudioCalendarWeek }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<"month" | "week">("week");
  const [week, setWeek] = useState(initialWeek);
  const [weekBusy, setWeekBusy] = useState(false);
  const [active, setActive] = useState<string>("all");
  const [day, setDay] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sig, setSig] = useState<{ member: string; url: string } | null>(null);

  async function goWeek(off: number) {
    setWeekBusy(true);
    const w = await loadStudioWeek(off);
    setWeekBusy(false);
    if (w) setWeek(w);
  }
  // 주간 뷰에서 변이(출석·이동) 후 서버 새로고침 + 주간 데이터 재로드(prop 갱신이 state에 안 붙으므로).
  async function refreshActive() {
    router.refresh();
    if (view === "week") {
      const w = await loadStudioWeek(week.offset);
      if (w) setWeek(w);
    }
  }

  // 일정 조율 모달 상태 — 캘린더 날짜 모달에서 예정 수업을 클릭하면 열린다.
  const [prop, setProp] = useState<{ c: StudioClass; view: ProposeView } | null>(null);
  const [propMode, setPropMode] = useState<"direct" | "propose">("direct"); // 직접 변경 vs 회원에게 제안
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [reason, setReason] = useState<string | null>(null);
  const [reasonText, setReasonText] = useState("");
  const [customDate, setCustomDate] = useState(""); // propose 모드의 추가 제안 슬롯
  const [customTime, setCustomTime] = useState("");
  const [directDate, setDirectDate] = useState(""); // direct 모드의 새 시각(현재 시각 프리필)
  const [directTime, setDirectTime] = useState("");
  const [sending, setSending] = useState(false);

  async function openSignature(c: StudioClass) {
    const url = await loadSessionSignature(c.sessionId);
    if (!url) return toast("서명을 불러오지 못했어요", "error");
    setSig({ member: c.member, url });
  }

  // 수업 기록 모달 — 캘린더 날짜 모달의 수업 행에서 '기록'을 누르면 기존 기록·종목 옵션을 온디맨드 로드한다.
  const [rec, setRec] = useState<RecordView | null>(null);
  const [recExercises, setRecExercises] = useState<RecExercise[]>([]);
  const [recComment, setRecComment] = useState("");
  const [recSaving, setRecSaving] = useState(false);
  const updateEx = (i: number, patch: Partial<RecExercise>) =>
    setRecExercises((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  async function openRecord(c: StudioClass) {
    setBusy(c.sessionId);
    const r = await loadRecordTarget(c.sessionId);
    setBusy(null);
    if (!r) return toast("기록 정보를 불러오지 못했어요", "error");
    setRecExercises(r.target.exercises);
    setRecComment(r.target.comment ?? "");
    setRec(r);
  }

  async function saveRec() {
    if (!rec || recSaving) return;
    setRecSaving(true);
    const r = await saveRecord(rec.target.sessionId, recExercises, recComment || undefined);
    setRecSaving(false);
    if (!r.ok) return toast(r.error ?? "기록 저장에 실패했어요", "error");
    toast("기록을 저장했어요");
    setRec(null);
    router.refresh();
  }

  async function openPropose(c: StudioClass) {
    setBusy(c.sessionId);
    const view = await loadProposeSlots(c.sessionId);
    setBusy(null);
    if (!view) return toast("조율 정보를 불러오지 못했어요", "error");
    setPropMode("direct");
    setPicked(new Set());
    setReason(null);
    setReasonText("");
    setCustomDate("");
    setCustomTime("");
    // 직접 변경 기본값 = 현재 수업 시각(KST) 프리필 → 대표가 시간만 살짝 바꾸면 됨
    const kst = new Date(new Date(c.scheduledAt).getTime() + 9 * 3600 * 1000);
    setDirectDate(kst.toISOString().slice(0, 10));
    setDirectTime(kst.toISOString().slice(11, 16));
    setProp({ c, view });
  }

  async function submitDirect() {
    if (!prop || !directDate || !directTime) return;
    const iso = new Date(`${directDate}T${directTime}:00+09:00`).toISOString();
    if (iso <= new Date().toISOString()) return toast("지난 시간으로는 옮길 수 없어요", "error");
    setSending(true);
    const r = await moveSessionDirect(prop.c.sessionId, iso);
    setSending(false);
    if (!r.ok) return toast(r.error ?? "일정 변경에 실패했어요", "error");
    toast("일정을 변경했어요");
    setProp(null);
    setDay(null);
    await refreshActive();
  }

  function toggleSlot(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < 3) next.add(id);
      return next;
    });
  }

  const proposeCount = picked.size + (customDate && customTime ? 1 : 0);

  async function submitPropose() {
    if (!prop) return;
    const customIso =
      customDate && customTime ? new Date(`${customDate}T${customTime}:00+09:00`).toISOString() : null;
    if (customIso && customIso <= new Date().toISOString()) return toast("지난 시간은 제안할 수 없어요", "error");
    const slotsIso = [
      ...prop.view.slots.filter((s) => picked.has(s.id)).map((s) => s.iso),
      ...(customIso ? [customIso] : []),
    ];
    if (slotsIso.length === 0) return;
    setSending(true);
    const r = await sendPropose(
      prop.c.sessionId,
      slotsIso,
      reason === "직접 입력" ? reasonText.trim() || undefined : reason ?? undefined,
    );
    setSending(false);
    if (!r.ok) return toast(r.error ?? "요청 전송에 실패했어요", "error");
    toast("일정 조율 요청을 보냈어요");
    setProp(null);
  }

  function go(off: number) {
    router.push(`/console/calendar?m=${off}`);
  }
  const match = (c: StudioClass) => active === "all" || c.trainerId === active;
  function classesOn(iso: string): StudioClass[] {
    const src = view === "week" ? week.byDate : month.byDate;
    return (src[iso] ?? []).filter(match);
  }

  async function mark(id: string, action: "attend" | "noshow") {
    setBusy(id);
    const r = await confirmAttendance(id, action);
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "처리에 실패했어요", "error");
    toast(action === "attend" ? "출석 처리했어요" : "노쇼 처리했어요");
    await refreshActive();
  }

  // 오처리 정정(감사 H1): 예정 상태로 되돌리고 차감된 회차를 복구한다.
  async function revert(id: string) {
    if (!(await confirm({ title: "이 수업 처리를 되돌릴까요?", description: "차감된 회차가 복구되고 '예정' 상태로 돌아가요.", confirmLabel: "되돌리기" }))) return;
    setBusy(id);
    const r = await revertAttendance(id);
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "되돌리지 못했어요", "error");
    toast("처리를 되돌렸어요");
    await refreshActive();
  }

  const modalClasses = day ? classesOn(day) : [];

  return (
    <>
      {/* toolbar */}
      <div className="mb-4 flex items-center gap-3.5">
        {/* 월간/주간 토글 */}
        <div className="flex gap-1 rounded-[11px] bg-[#F1ECE2] p-1">
          {([["week", "주간"], ["month", "월간"]] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-[8px] px-3.5 py-[7px] text-[13px] font-semibold transition ${view === v ? "bg-white text-ink shadow-sm" : "text-[#847A66]"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => (view === "week" ? goWeek(week.offset - 1) : go(month.offset - 1))} disabled={weekBusy} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white text-[#5B5345] transition hover:bg-[#F4F0E8] disabled:opacity-50"><Icon name="chevron-left" size={18} /></button>
          <button onClick={() => (view === "week" ? goWeek(0) : go(0))} disabled={weekBusy} className="h-9 rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white px-3.5 text-[13px] font-semibold text-[#5B5345] transition hover:bg-[#F4F0E8] disabled:opacity-50">오늘</button>
          <button onClick={() => (view === "week" ? goWeek(week.offset + 1) : go(month.offset + 1))} disabled={weekBusy} className="flex h-9 w-9 items-center justify-center rounded-[10px] border border-[rgba(75,59,46,0.1)] bg-white text-[#5B5345] transition hover:bg-[#F4F0E8] disabled:opacity-50"><Icon name="chevron-right" size={18} /></button>
        </div>
        <div>
          <div className="text-[18px] font-bold text-ink">{view === "week" ? week.weekLabel : month.monthLabel}</div>
          <div className="text-[12px] font-medium text-[#9A917F]">{view === "week" ? `이번 주 수업 ${week.classes.filter((c) => c.status !== "cancelled").length}건` : `이번 달 수업 ${month.monthTotal}건`}</div>
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

      {view === "week" ? (
        <WeekGrid week={week} match={match} onOpenDay={setDay} />
      ) : (
      /* month board */
      <Card className="overflow-hidden">
        <div className="grid grid-cols-7 border-b border-[rgba(75,59,46,0.08)]">
          {WD.map((w, i) => (
            <div key={w} className={`py-[11px] text-center text-[11.5px] font-semibold ${i === 0 ? "text-[#C0796A]" : i === 6 ? "text-[#B89A5E]" : "text-[#9A917F]"}`}>{w}</div>
          ))}
        </div>
        {month.weeks.map((wk, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-[rgba(75,59,46,0.06)] last:border-b-0">
            {wk.map((cell, ci) => {
              if (cell.date == null) return <div key={ci} className="min-h-[120px] border-l border-[rgba(75,59,46,0.05)] first:border-l-0" />;
              const cls = classesOn(cell.dateISO);
              const live = cls.filter((c) => c.status !== "cancelled");
              return (
                <button
                  key={ci}
                  onClick={() => setDay(cell.dateISO)}
                  className="flex min-h-[120px] flex-col border-l border-[rgba(75,59,46,0.05)] p-[7px] pb-[9px] text-left align-top transition first:border-l-0 hover:brightness-[0.985]"
                  style={{ background: cell.isToday ? "#F3F7EC" : "transparent" }}
                >
                  <div className="mb-1.5 flex items-start justify-between">
                    {/* 날짜는 셀 왼쪽 상단 코너에 밀착(flush) — 오늘만 pill 하이라이트 */}
                    {cell.isToday ? (
                      <span className="inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-[6px] px-1 text-[12.5px] font-bold" style={{ color: "#FAF8F4", background: "#768C6A" }}>{cell.date}</span>
                    ) : (
                      <span className="text-[12.5px] font-bold leading-none" style={{ color: cell.isSunday ? "#C0796A" : cell.isSaturday ? "#B89A5E" : "#5B5345" }}>{cell.date}</span>
                    )}
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
      )}

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
                    {/* 예정 수업 클릭 → 일정 조율 요청 모달 */}
                    <button
                      type="button"
                      disabled={c.status !== "scheduled" || busy === c.sessionId}
                      title={c.status === "scheduled" ? "일정 조율 요청" : undefined}
                      onClick={() => openPropose(c)}
                      className="-m-1.5 flex min-w-0 flex-1 items-center gap-3 rounded-[10px] p-1.5 text-left transition enabled:cursor-pointer enabled:hover:bg-[#F7F4ED]"
                    >
                      <div className="w-[58px] flex-none">
                        <div className="text-[13.5px] font-bold text-ink">{c.start}</div>
                        <div className="mt-px text-[10px] font-medium text-[#A89F92]">{c.end}</div>
                      </div>
                      <div className="h-[38px] w-[3px] flex-none rounded-[2px]" style={{ background: c.color }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-bold text-ink">{c.member}{c.isTeam ? " · 2:1" : ""}</div>
                        <div className="text-[11px] font-medium text-[#9A917F]">{c.trainerName}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={busy === c.sessionId}
                      title="수업 기록"
                      onClick={() => openRecord(c)}
                      className="flex-none rounded-[9px] border border-[rgba(75,59,46,0.14)] bg-white px-2.5 py-[7px] text-[12px] font-semibold text-[#766D60] transition hover:bg-[#F4F0E8] disabled:opacity-40"
                    >
                      기록
                    </button>
                    {c.showAttend ? (
                      <div className="flex flex-none gap-1.5">
                        <OBtn className="!px-3 !py-[7px] text-[12.5px]" disabled={busy === c.sessionId} onClick={() => mark(c.sessionId, "attend")}>출석</OBtn>
                        <GBtn disabled={busy === c.sessionId} onClick={() => mark(c.sessionId, "noshow")}>노쇼</GBtn>
                      </div>
                    ) : c.status === "attended" || c.status === "noshow" || c.status === "cancelled" ? (
                      <div className="flex flex-none items-center gap-2">
                        {c.signed ? (
                          <button
                            type="button"
                            onClick={() => openSignature(c)}
                            className="text-[11.5px] font-semibold text-sage-deep underline underline-offset-2"
                          >
                            서명
                          </button>
                        ) : null}
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

      {/* 일정 조율 — 예정 수업 클릭 시. 직접 변경(즉시 이동) 또는 회원에게 제안(회원 승인). */}
      {prop ? (
        <ConsoleModal
          title="일정 조율"
          onClose={() => setProp(null)}
          footer={
            propMode === "direct" ? (
              <>
                <GBtn className="flex-1" onClick={() => setProp(null)}>취소</GBtn>
                <PBtn className="flex-[2]" icon="check-bold" disabled={!directDate || !directTime || sending} onClick={submitDirect}>
                  이 시간으로 변경
                </PBtn>
              </>
            ) : (
              <>
                <GBtn className="flex-1" onClick={() => setProp(null)}>취소</GBtn>
                <PBtn className="flex-[2]" disabled={proposeCount === 0 || sending} onClick={submitPropose}>
                  조율 요청 보내기 · {proposeCount}개 제안
                </PBtn>
              </>
            )
          }
        >
          <div className="mb-4 flex items-center gap-2 rounded-[11px] border border-[rgba(75,59,46,0.1)] bg-[#FAF8F4] px-3.5 py-3">
            <span className="text-[13px] font-semibold text-[#8A8175] line-through">{prop.view.before}</span>
            <span className="text-[13px] font-bold text-ink">{prop.view.memberName}</span>
            <span className="ml-auto text-[11px] font-medium text-[#9A917F]">{prop.c.trainerName}</span>
          </div>

          {/* 모드 토글 */}
          <div className="mb-4 grid grid-cols-2 gap-1.5 rounded-[12px] bg-[#F1ECE2] p-1">
            {([["direct", "직접 변경"], ["propose", "회원에게 제안"]] as const).map(([m, label]) => (
              <button
                key={m}
                type="button"
                onClick={() => setPropMode(m)}
                className={`rounded-[9px] py-2 text-[13px] font-semibold transition ${propMode === m ? "bg-white text-ink shadow-sm" : "text-[#847A66]"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {propMode === "direct" ? (
            <>
              <MicroLabel className="mb-2">새 시간 지정</MicroLabel>
              <div className="flex items-center gap-2 rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-white px-3.5 py-2.5">
                <input
                  type="date"
                  value={directDate}
                  onChange={(e) => setDirectDate(e.target.value)}
                  className="flex-1 bg-transparent text-[13.5px] font-semibold text-ink"
                />
                <input
                  type="time"
                  value={directTime}
                  onChange={(e) => setDirectTime(e.target.value)}
                  step={1800}
                  className="bg-transparent text-[13.5px] font-semibold text-ink"
                />
              </div>
              <div className="mt-3 flex items-start gap-2.5 rounded-[11px] bg-[#F3F7EC] px-3.5 py-2.5">
                <Icon name="circle-info" size={15} className="mt-px flex-none text-sage-deep" />
                <span className="text-[12px] font-medium leading-relaxed text-[#5B6452]">회원 승인 없이 <b className="font-semibold">바로 이 시간으로</b> 옮겨져요. 이미 통화·확인된 변경을 손수 반영할 때 쓰세요.</span>
              </div>
            </>
          ) : (
            <>
              <MicroLabel className="mb-2">새 시간 제안 · 최대 3개</MicroLabel>
              <div className="flex flex-col gap-2">
                {prop.view.slots.map((s) => {
                  const on = picked.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSlot(s.id)}
                      className={`w-full rounded-[11px] border px-3.5 py-2.5 text-left text-[13.5px] font-semibold transition ${on ? "border-sage bg-[#F3F7EC] text-ink" : "border-[rgba(75,59,46,0.12)] bg-white text-[#5B5345] hover:bg-[#F7F4ED]"}`}
                    >
                      {s.label}
                    </button>
                  );
                })}
                <div className="flex items-center gap-2 rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-white px-3.5 py-2.5">
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="flex-1 bg-transparent text-[13.5px] font-semibold text-ink"
                  />
                  <input
                    type="time"
                    value={customTime}
                    onChange={(e) => setCustomTime(e.target.value)}
                    step={1800}
                    className="bg-transparent text-[13.5px] font-semibold text-ink"
                  />
                </div>
              </div>

              <MicroLabel className="mb-2 mt-4">사유 (선택)</MicroLabel>
              <div className="mb-4 flex flex-wrap gap-2">
                {prop.view.reasons.map((r) => {
                  const on = reason === r;
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReason((prev) => (prev === r ? null : r))}
                      className={`rounded-[20px] border px-3 py-1.5 text-[12.5px] font-semibold transition ${on ? "border-sage bg-sage text-white" : "border-[rgba(75,59,46,0.12)] bg-white text-[#766D60] hover:bg-[#F7F4ED]"}`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
              {reason === "직접 입력" ? (
                <input
                  value={reasonText}
                  onChange={(e) => setReasonText(e.target.value)}
                  placeholder="사유를 입력해주세요"
                  className="mb-4 w-full rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-white px-3.5 py-2.5 text-[13px]"
                />
              ) : null}
            </>
          )}
        </ConsoleModal>
      ) : null}

      {/* 수업 기록 — 날짜 모달의 수업 행에서 '기록' 클릭 시. 모바일 운동 기록과 동일한 폼(종목·중량·세트·코멘트). */}
      {rec ? (
        <ConsoleModal
          title="수업 기록"
          width={460}
          onClose={() => setRec(null)}
          footer={
            <>
              <GBtn className="flex-1" onClick={() => setRec(null)}>취소</GBtn>
              <PBtn className="flex-[2]" icon="check-bold" pending={recSaving} onClick={saveRec}>기록 저장</PBtn>
            </>
          }
        >
          <div className="mb-4 flex items-center gap-2.5 rounded-[12px] bg-[#F3F7EC] px-3.5 py-2.5">
            <span className="text-[13.5px] font-bold text-ink">{rec.target.name}</span>
            <span className="text-[12px] font-medium text-[#847A66]">{rec.target.dateLabel}</span>
          </div>

          <MicroLabel className="mb-2">운동 종목</MicroLabel>
          <div className="flex flex-col gap-2.5">
            {recExercises.map((ex, i) => (
              <div key={i} className="rounded-[13px] border border-[rgba(75,59,46,0.1)] bg-[#FBF9F5] p-3">
                <div className="mb-2.5 flex items-center gap-2">
                  <div className="flex-1">
                    <Combobox value={ex.name} options={rec.exerciseOptions} onChange={(v) => updateEx(i, { name: v })} placeholder="종목 이름" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setRecExercises((prev) => prev.filter((_, idx) => idx !== i))}
                    aria-label="종목 삭제"
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[#A89F92] transition hover:bg-ink/[0.06]"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
                <div className="flex items-center gap-2.5">
                  <Stepper value={ex.kg} unit="kg" onDec={() => updateEx(i, { kg: Math.max(0, ex.kg - 5) })} onInc={() => updateEx(i, { kg: ex.kg + 5 })} />
                  <Stepper value={ex.sets} unit="세트" onDec={() => updateEx(i, { sets: Math.max(0, ex.sets - 1) })} onInc={() => updateEx(i, { sets: ex.sets + 1 })} />
                </div>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setRecExercises((prev) => [...prev, { name: "", kg: 0, sets: 0 }])}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-dashed border-sage-deep/40 py-2.5 text-[13px] font-bold text-sage-deep transition hover:bg-[#F3F7EC]"
          >
            <Icon name="plus-bold" size={15} />
            종목 추가
          </button>

          <MicroLabel className="mb-2 mt-4">코멘트</MicroLabel>
          <textarea
            value={recComment}
            onChange={(e) => setRecComment(e.target.value)}
            placeholder="오늘 수업 코멘트를 남겨주세요…"
            rows={3}
            className="w-full resize-none rounded-[12px] border border-[rgba(75,59,46,0.12)] bg-white px-3.5 py-3 text-[13.5px] text-ink outline-none placeholder:text-[#B3AA9C] focus:ring-2 focus:ring-sage/40"
          />
        </ConsoleModal>
      ) : null}

      {/* 수업 완료 회원 확인 서명 뷰어 */}
      {sig ? (
        <ConsoleModal title={`${sig.member} · 수업 완료 서명`} onClose={() => setSig(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sig.url} alt="회원 확인 서명" className="w-full rounded-[13px] border border-[rgba(75,59,46,0.1)]" />
        </ConsoleModal>
      ) : null}
    </>
  );
}
