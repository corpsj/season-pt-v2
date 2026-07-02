"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { Select } from "@/components/ui/Select";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { TextInput } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { createTeamSchedule } from "@/lib/data/groups/owner-ops-actions";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
function hourLabel(h: number) {
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
}
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => ({ value: String(i + 6), label: hourLabel(i + 6) }));
const MINUTE_OPTIONS = [{ value: "0", label: "정각" }, { value: "30", label: "30분" }];

export function TeamCreateClient({
  memberId,
  memberName,
  candidates,
}: {
  memberId: string;
  memberName: string;
  candidates: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [dayTimes, setDayTimes] = useState<Record<number, { hour: number; minute: number }>>({});
  const [pending, setPending] = useState(false);

  const partner = candidates.find((c) => c.id === partnerId) ?? null;
  const filtered = useMemo(
    () => (q.trim() ? candidates.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase())) : candidates),
    [q, candidates],
  );

  function toggleDay(i: number) {
    setDayTimes((prev) => {
      const next = { ...prev };
      if (next[i] != null) delete next[i];
      else next[i] = { hour: 19, minute: 0 };
      return next;
    });
  }

  const selectedDays = Object.keys(dayTimes).map(Number).sort((a, b) => a - b);

  async function submit() {
    if (pending) return;
    if (!partnerId) return toast("팀을 이룰 파트너 회원을 선택해주세요");
    const slots = selectedDays.map((wd) => ({ weekday: wd, hour: dayTimes[wd].hour, minute: dayTimes[wd].minute }));
    if (slots.length === 0) return toast("수업 요일·시간을 하나 이상 선택해주세요");
    setPending(true);
    const res = await createTeamSchedule({ memberIds: [memberId, partnerId], slots });
    if (!res.ok) {
      setPending(false);
      return toast(res.error ?? "팀 만들기에 실패했어요");
    }
    toast(res.warn ?? "2:1 팀을 만들었어요");
    router.push(`/t/members/${memberId}`);
    router.refresh();
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback={`/t/members/${memberId}`} />
          <span className="text-[19px] font-bold text-ink">2:1 팀 만들기</span>
        </div>

        <Banner tone="team" className="mb-4">
          {memberName}님과 팀을 이룰 회원을 골라 시간을 정하면, 출석·차감·일정 변경이 항상 두 분 함께 처리돼요. 회원권은 각자 유지돼요.
        </Banner>

        {/* 파트너 선택 */}
        <div className="mb-2.5">
          <Kicker>파트너 회원</Kicker>
        </div>
        {partner ? (
          <div className="mb-4 flex items-center gap-2.5 rounded-[13px] border border-sage/40 bg-sage-banner2 px-4 py-3">
            <Icon name="person" size={16} className="flex-none text-sage-deep" />
            <span className="flex-1 text-[14px] font-bold text-ink">{partner.name}</span>
            <button type="button" onClick={() => setPartnerId(null)} className="text-[12.5px] font-semibold text-muted5">
              변경
            </button>
          </div>
        ) : candidates.length > 0 ? (
          <div className="mb-4">
            <TextInput placeholder="회원 이름 검색" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-2 flex max-h-[220px] flex-col overflow-y-auto rounded-[13px] border border-ink/[0.1]">
              {filtered.length > 0 ? (
                filtered.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setPartnerId(c.id); setQ(""); }}
                    className="tappable flex items-center gap-2.5 border-b border-ink/[0.06] px-4 py-3 text-left last:border-b-0"
                  >
                    <Icon name="person" size={15} className="flex-none text-muted3" />
                    <span className="text-[13.5px] font-semibold text-ink">{c.name}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-5 text-center text-[13px] font-medium text-muted">검색 결과가 없어요</div>
              )}
            </div>
          </div>
        ) : (
          <Banner tone="neutral" className="mb-4">
            같은 담당 강사의 묶을 수 있는 회원이 없어요. 파트너 회원을 먼저 등록하거나 담당 강사를 맞춰주세요.
          </Banner>
        )}

        {/* 요일·시간 */}
        <div className="mb-2.5 mt-2">
          <Kicker>팀 수업 요일</Kicker>
        </div>
        <div className="mb-3 flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = dayTimes[i] != null;
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i)}
                className={`tappable flex-1 rounded-[11px] py-[10px] text-center text-[13px] font-bold ${
                  on ? "bg-sage text-surface" : i === 0 ? "bg-sage-banner text-sunday font-semibold" : "bg-sage-banner text-muted5 font-semibold"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>

        {selectedDays.length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {selectedDays.map((i) => (
              <div key={i} className="flex items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-3.5 py-2.5">
                <span className={`w-7 shrink-0 text-center text-[13px] font-bold ${i === 0 ? "text-sunday" : "text-ink"}`}>{DAYS[i]}</span>
                <div className="flex flex-1 gap-2">
                  <div className="flex-1">
                    <Select
                      value={String(dayTimes[i].hour)}
                      options={HOUR_OPTIONS}
                      onChange={(v) => setDayTimes((prev) => ({ ...prev, [i]: { ...prev[i], hour: Number(v) } }))}
                    />
                  </div>
                  <div className="flex-1">
                    <SegmentedToggle
                      options={MINUTE_OPTIONS}
                      value={String(dayTimes[i].minute)}
                      onChange={(v) => setDayTimes((prev) => ({ ...prev, [i]: { ...prev[i], minute: Number(v) } }))}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <Banner tone="neutral">선택한 요일·시간에 매주 팀 수업이 자동 생성돼요.</Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="persons" onClick={submit} disabled={pending || !partnerId || selectedDays.length === 0}>
          2:1 팀 만들기
        </PrimaryButton>
      </Footer>
    </div>
  );
}
