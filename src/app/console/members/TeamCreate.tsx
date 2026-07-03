import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { ConsoleModal, OBtn, PBtn } from "@/components/console/ui";
import { createTeamSchedule, setTeamSchedule } from "@/lib/data/groups/owner-ops-actions";
import { loadTeamCandidates, loadMemberSchedule } from "@/lib/data/groups/console-actions";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const HOURS = Array.from({ length: 17 }, (_, i) => i + 6); // 6~22시
function hourLabel(h: number) {
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
}
type DayTimes = Record<number, { hour: number; minute: number }>;

/**
 * 2:1 팀 만들기: 선택한 회원 + 파트너(같은 담당 강사) + 정기 시간을 묶어 2on1 스케줄을 생성.
 * 회원권은 각자 유지하고 출석·차감·조율은 세션 단위로 항상 함께 움직인다.
 */
export function TeamCreateModal({
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
  const [q, setQ] = useState("");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [dayTimes, setDayTimes] = useState<DayTimes>({});
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    loadTeamCandidates(memberId).then((list) => {
      if (alive) { setCandidates(list); setLoading(false); }
    });
    return () => { alive = false; };
  }, [memberId]);

  const partner = candidates.find((c) => c.id === partnerId) ?? null;
  const filtered = q.trim()
    ? candidates.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()))
    : candidates;

  const selectedDays = Object.keys(dayTimes).map(Number).sort((a, b) => a - b);

  async function save() {
    if (busy) return;
    if (!partnerId) return toast("팀을 이룰 파트너 회원을 선택해주세요", "error");
    const slots = Object.entries(dayTimes).map(([wd, t]) => ({ weekday: Number(wd), hour: t.hour, minute: t.minute }));
    if (slots.length === 0) return toast("수업 요일·시간을 하나 이상 선택해주세요", "error");
    setBusy(true);
    const r = await createTeamSchedule({ memberIds: [memberId, partnerId], slots });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "팀 만들기에 실패했어요", "error");
    toast(r.warn ?? "2:1 팀을 만들었어요");
    await onDone();
    onClose();
  }

  return (
    <ConsoleModal
      title={`${memberName} · 2:1 팀 만들기`}
      onClose={onClose}
      footer={
        <>
          <OBtn className="flex-1" onClick={onClose}>취소</OBtn>
          <PBtn icon="check-bold" className="flex-[1.6]" pending={busy} disabled={!partnerId || selectedDays.length === 0} onClick={save}>팀 만들기</PBtn>
        </>
      }
    >
      <div className="mb-4 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
        <Icon name="persons" size={16} className="mt-px flex-none text-[#8A6F3E]" />
        <span className="text-[12.5px] font-medium leading-relaxed text-[#766D60]">
          두 회원은 <b className="font-semibold text-[#5B5345]">같은 담당 강사</b>여야 해요. 출석·차감·일정 변경은 항상 <b className="font-semibold text-[#5B5345]">두 분 함께</b> 처리돼요. 회원권은 각자 유지돼요.
        </span>
      </div>

      {/* 파트너 선택 */}
      <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">파트너 회원</div>
      {loading ? (
        <div className="mb-3 rounded-[11px] border border-[rgba(75,59,46,0.1)] py-6 text-center text-[12.5px] font-medium text-[#A89F92]">불러오는 중…</div>
      ) : partner ? (
        <div className="mb-3 flex items-center gap-2 rounded-[12px] border border-sage/40 bg-[#F3F6EF] px-3.5 py-2.5">
          <Icon name="person" size={15} className="flex-none text-sage-deep" />
          <span className="flex-1 text-[13.5px] font-semibold text-ink">{partner.name}</span>
          <button type="button" onClick={() => setPartnerId(null)} className="text-[12px] font-semibold text-[#9A917F] hover:text-ink">변경</button>
        </div>
      ) : candidates.length === 0 ? (
        <div className="mb-3 rounded-[11px] bg-[#FBF7F1] px-3.5 py-4 text-center text-[12.5px] font-medium text-[#A89F92]">
          같은 담당 강사의 묶을 수 있는 회원이 없어요
        </div>
      ) : (
        <>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="회원 이름 검색"
            className="mb-2 w-full rounded-[11px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-3.5 py-2.5 text-[13.5px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
          />
          <div className="mb-3 max-h-[168px] overflow-y-auto rounded-[11px] border border-[rgba(75,59,46,0.1)]">
            {filtered.length > 0 ? (
              filtered.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setPartnerId(c.id); setQ(""); }}
                  className="flex w-full items-center gap-2 border-b border-[rgba(75,59,46,0.06)] px-3.5 py-2.5 text-left last:border-b-0 hover:bg-[#F7F3EB]"
                >
                  <Icon name="person" size={14} className="flex-none text-[#A89F92]" />
                  <span className="text-[13px] font-semibold text-ink">{c.name}</span>
                </button>
              ))
            ) : (
              <div className="px-3.5 py-4 text-center text-[12.5px] font-medium text-[#A89F92]">검색 결과가 없어요</div>
            )}
          </div>
        </>
      )}

      {/* 요일·시간 */}
      <div className="mb-2 mt-4 text-[11.5px] font-semibold text-[#9A917F]">팀 수업 요일·시간</div>
      <TeamSlotPicker dayTimes={dayTimes} setDayTimes={setDayTimes} />
    </ConsoleModal>
  );
}

/** 요일 토글 + 요일별 시간 선택 — 팀 만들기/편집 모달 공용. */
function TeamSlotPicker({
  dayTimes,
  setDayTimes,
}: {
  dayTimes: DayTimes;
  setDayTimes: React.Dispatch<React.SetStateAction<DayTimes>>;
}) {
  const selectedDays = Object.keys(dayTimes).map(Number).sort((a, b) => a - b);
  function toggleDay(i: number) {
    setDayTimes((prev) => {
      const next = { ...prev };
      if (next[i]) delete next[i];
      else next[i] = { hour: 19, minute: 0 };
      return next;
    });
  }
  return (
    <>
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
      {selectedDays.length > 0 ? (
        <div className="flex flex-col gap-2">
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
        <div className="rounded-[13px] bg-[#FBF7F1] py-4 text-center text-[12.5px] font-medium text-[#A89F92]">
          요일을 선택하면 매주 그 시간에 팀 수업이 자동 생성돼요
        </div>
      )}
    </>
  );
}

/** 2:1 팀 일정 편집·해제(콘솔): 현재 팀 슬롯을 불러와 팀 단위로 변경. 파트너 교체는 해제 후 재구성. */
export function TeamEditModal({
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
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dayTimes, setDayTimes] = useState<DayTimes>({});
  const [partnerName, setPartnerName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    loadMemberSchedule(memberId).then((res) => {
      if (!alive) return;
      const team = (res?.slots ?? []).filter((s) => s.type === "2on1");
      const dt: DayTimes = {};
      for (const s of team) dt[s.weekday] ??= { hour: s.hour, minute: s.minute };
      setDayTimes(dt);
      setPartnerName(team[0]?.partnerName);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [memberId]);

  async function save() {
    if (busy) return;
    const slots = Object.entries(dayTimes).map(([wd, t]) => ({ weekday: Number(wd), hour: t.hour, minute: t.minute }));
    if (slots.length === 0) return toast("수업 요일·시간을 하나 이상 선택해주세요 (팀을 끝내려면 '팀 해제')", "error");
    setBusy(true);
    const r = await setTeamSchedule(memberId, slots);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "일정 변경에 실패했어요", "error");
    toast(r.warn ?? "팀 일정을 변경했어요");
    await onDone();
    onClose();
  }

  async function dissolve() {
    if (busy) return;
    if (!(await confirm({ title: "2:1 팀을 해제할까요?", description: "앞으로의 팀 수업이 모두 삭제돼요. 지난·처리된 수업은 그대로예요.", confirmLabel: "해제", tone: "warn" }))) return;
    setBusy(true);
    const r = await setTeamSchedule(memberId, []);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "팀 해제에 실패했어요", "error");
    toast("팀을 해제했어요 — 각 회원의 정기 일정을 다시 설정해주세요");
    await onDone();
    onClose();
  }

  return (
    <ConsoleModal
      title={`${memberName} · 2:1 팀 일정`}
      onClose={onClose}
      footer={
        <>
          <OBtn className="flex-1" onClick={dissolve}>팀 해제</OBtn>
          <PBtn icon="check-bold" className="flex-[1.6]" pending={busy} disabled={loading} onClick={save}>저장</PBtn>
        </>
      }
    >
      {loading ? (
        <div className="py-10 text-center text-[13px] font-medium text-[#A89F92]">불러오는 중…</div>
      ) : (
        <>
          <div className="mb-4 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
            <Icon name="persons" size={16} className="mt-px flex-none text-[#8A6F3E]" />
            <span className="text-[12.5px] font-medium leading-relaxed text-[#766D60]">
              {partnerName ? <><b className="font-semibold text-[#5B5345]">{partnerName}님</b>과의 팀 일정이에요. </> : null}
              요일·시간을 바꾸면 <b className="font-semibold text-[#5B5345]">앞으로의 팀 수업도 함께</b> 바뀌어요. 파트너를 바꾸려면 해제 후 다시 묶어주세요.
            </span>
          </div>
          <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">팀 수업 요일·시간</div>
          <TeamSlotPicker dayTimes={dayTimes} setDayTimes={setDayTimes} />
        </>
      )}
    </ConsoleModal>
  );
}
