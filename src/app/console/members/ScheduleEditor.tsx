import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { ConsoleModal, OBtn, PBtn } from "@/components/console/ui";
import { loadMemberSchedule } from "@/lib/data/groups/console-actions";
import { setMemberSchedule } from "@/lib/data/groups/owner-ops-actions";
import type { MemberScheduleSlot } from "@/lib/data/groups/owner-ops";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6~22시
function hourLabel(h: number) {
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
}
type DayTimes = Record<number, { hour: number; minute: number }>;

export function ScheduleEditModal({
  memberId,
  memberName,
  onClose,
  onDone,
}: {
  memberId: string;
  memberName: string;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dayTimes, setDayTimes] = useState<DayTimes>({});
  const [teamSlots, setTeamSlots] = useState<MemberScheduleSlot[]>([]);

  useEffect(() => {
    let alive = true;
    loadMemberSchedule(memberId).then((res) => {
      if (!alive) return;
      const editable = (res?.slots ?? []).filter((s) => s.editable);
      const dt: DayTimes = {};
      for (const s of editable) dt[s.weekday] ??= { hour: s.hour, minute: s.minute };
      setDayTimes(dt);
      setTeamSlots((res?.slots ?? []).filter((s) => !s.editable));
      setLoading(false);
    });
    return () => { alive = false; };
  }, [memberId]);

  function toggleDay(i: number) {
    setDayTimes((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      else next[i] = { hour: 19, minute: 0 };
      return next;
    });
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    const slots = Object.entries(dayTimes).map(([wd, t]) => ({ weekday: Number(wd), hour: t.hour, minute: t.minute }));
    const r = await setMemberSchedule(memberId, slots);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "일정 변경에 실패했어요");
    toast(r.warn ?? "정기 일정을 변경했어요");
    await onDone();
    onClose();
  }

  const selectedDays = Object.keys(dayTimes).map(Number).sort((a, b) => a - b);

  return (
    <ConsoleModal
      title={`${memberName} · 정기 수업 일정`}
      onClose={onClose}
      footer={
        <>
          <OBtn className="flex-1" onClick={onClose}>취소</OBtn>
          <PBtn icon="check-bold" className="flex-[1.6]" disabled={busy || loading} onClick={save}>저장</PBtn>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-[13px] font-medium text-[#A89F92]">불러오는 중…</div>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
            <Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" />
            <span className="text-[12.5px] font-medium leading-relaxed text-[#766D60]">
              요일·시간을 바꾸면 <b className="font-semibold text-[#5B5345]">앞으로의 예정 수업도 함께</b> 바뀌어요. 이미 지난·처리된 수업은 그대로예요.
            </span>
          </div>

          {/* 요일 토글 */}
          <div className="mb-3 flex gap-1.5">
            {DAYS.map((d, i) => {
              const on = !!dayTimes[i];
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`flex-1 rounded-[11px] py-[10px] text-center text-[13px] font-bold transition ${on ? "bg-sage text-white" : "bg-[#F4EFE6] text-[#847A66] hover:bg-[#ECE6DA]"}`}
                >
                  {d}
                </button>
              );
            })}
          </div>

          {/* 요일별 시간 */}
          {selectedDays.length > 0 ? (
            <div className="mb-1 flex flex-col gap-2">
              {selectedDays.map((i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-[13px] border border-[rgba(75,59,46,0.12)] bg-[#FBF9F5] px-3.5 py-2.5">
                  <span className={`w-6 shrink-0 text-center text-[13px] font-bold ${i === 0 ? "text-terracotta" : "text-ink"}`}>{DAYS[i]}</span>
                  <select
                    value={dayTimes[i].hour}
                    onChange={(e) => setDayTimes((p) => ({ ...p, [i]: { ...p[i], hour: Number(e.target.value) } }))}
                    className="flex-1 rounded-[10px] border border-[rgba(75,59,46,0.14)] bg-white px-3 py-2 text-[13.5px] font-semibold text-ink outline-none"
                  >
                    {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                  </select>
                  <div className="flex gap-1">
                    {[0, 30].map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setDayTimes((p) => ({ ...p, [i]: { ...p[i], minute: m } }))}
                        className={`rounded-[10px] px-3 py-2 text-[13px] font-semibold transition ${dayTimes[i].minute === m ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}
                      >
                        {m === 0 ? "정각" : "30분"}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mb-1 rounded-[13px] bg-[#FBF7F1] py-4 text-center text-[12.5px] font-medium text-[#A89F92]">
              요일을 선택하면 매주 그 시간에 수업이 자동 생성돼요
            </div>
          )}

          {/* 2:1 팀 수업 (읽기 전용) */}
          {teamSlots.length > 0 ? (
            <div className="mt-4">
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">2:1 팀 수업 · 여기서 변경 불가</div>
              <div className="flex flex-col gap-1.5">
                {teamSlots.map((s) => (
                  <div key={s.scheduleId} className="flex items-center gap-2 rounded-[11px] bg-[#F4EEE3] px-3.5 py-2.5">
                    <Icon name="persons" size={15} className="flex-none text-[#8A6F3E]" />
                    <span className="text-[12.5px] font-semibold text-[#5B4B38]">
                      매주 {DAYS[s.weekday]} {hourLabel(s.hour)}{s.minute ? " 30분" : ""}{s.partnerName ? ` · ${s.partnerName}님과 팀` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </ConsoleModal>
  );
}
