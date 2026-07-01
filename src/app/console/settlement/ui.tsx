"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { Card, won } from "@/components/console/ui";
import { setTrainerRates } from "@/lib/data/groups/settlement-actions";
import type { Settlement, SettlementRow } from "@/lib/data/groups/settlement";

export function SettlementClient({ settlement }: { settlement: Settlement }) {
  const { monthOffset, monthLabel, rows, total } = settlement;

  return (
    <>
      {/* month nav + total */}
      <div className="mb-5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <NavArrow to={monthOffset + 1} dir="prev" />
          <span className="min-w-[104px] text-center text-[15px] font-bold text-ink">{monthLabel}</span>
          <NavArrow to={monthOffset - 1} dir="next" disabled={monthOffset <= 0} />
        </div>
        <div className="ml-auto flex items-baseline gap-2 rounded-[14px] bg-[#26231E] px-5 py-3">
          <span className="text-[12.5px] font-semibold text-[#CFC7B8]">이 달 지급 합계</span>
          <span className="text-[20px] font-bold text-surface">{won(total)}</span>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-center border-b border-[rgba(75,59,46,0.07)] px-5 py-[13px] text-[11.5px] font-semibold tracking-[0.02em] text-[#9A917F]">
          <span className="flex-1">강사</span>
          <span className="w-[150px] text-center">진행 수업 (1:1 · 2:1)</span>
          <span className="w-[220px] text-center">회당 단가</span>
          <span className="w-[110px] text-right">지급액</span>
        </div>
        {rows.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="text-[14px] font-semibold text-[#847A66]">강사가 없어요</div>
            <div className="mt-1.5 text-[12.5px] font-medium text-[#A89F92]">강사를 등록하면 정산이 표시돼요</div>
          </div>
        ) : (
          rows.map((r) => <TrainerRow key={r.trainerId} row={r} />)
        )}
      </Card>

      <div className="mt-4 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
        <Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" />
        <span className="text-[12.5px] font-medium leading-relaxed text-[#766D60]">
          정산은 해당 월에 <b className="font-semibold text-[#5B5345]">실제 진행(출석 확정)된 수업</b> 기준이에요. 2:1 팀 수업은 1회로 계산돼요. 지급액은 <b className="font-semibold text-[#5B5345]">각 수업 진행 시점의 단가</b>로 계산되며, 단가를 바꿔도 지난 정산은 바뀌지 않아요(다음 진행분부터 적용).
        </span>
      </div>
    </>
  );
}

function NavArrow({ to, dir, disabled }: { to: number; dir: "prev" | "next"; disabled?: boolean }) {
  const cls = "flex h-9 w-9 items-center justify-center rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60] transition hover:bg-[#F4F0E8]";
  if (disabled) return <span className={`${cls} pointer-events-none opacity-40`}><Icon name={dir === "prev" ? "chevron-left" : "chevron-right"} size={17} /></span>;
  return (
    <Link href={to <= 0 ? "/console/settlement" : `/console/settlement?m=${to}`} className={cls} aria-label={dir === "prev" ? "이전 달" : "다음 달"}>
      <Icon name={dir === "prev" ? "chevron-left" : "chevron-right"} size={17} />
    </Link>
  );
}

function TrainerRow({ row }: { row: SettlementRow }) {
  const router = useRouter();
  const toast = useToast();
  const [r1, setR1] = useState(String(row.rate1on1 || ""));
  const [r2, setR2] = useState(String(row.rate2on1 || ""));
  const [busy, setBusy] = useState(false);
  const dirty = Number(r1 || 0) !== row.rate1on1 || Number(r2 || 0) !== row.rate2on1;

  async function save() {
    if (busy || !dirty) return;
    setBusy(true);
    const res = await setTrainerRates(row.trainerId, Number(r1 || 0), Number(r2 || 0));
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "저장에 실패했어요");
    toast("단가를 저장했어요");
    router.refresh();
  }

  return (
    <div className="flex items-center border-b border-[rgba(75,59,46,0.05)] px-5 py-3.5">
      <div className="flex flex-1 items-center gap-3">
        <Avatar initial={row.name.slice(0, 1)} tone="sage" size={38} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-[14px] font-semibold text-ink">{row.name}</span>
            {row.role === "owner" ? <span className="rounded-[6px] bg-[#F3EAD2] px-1.5 py-[2px] text-[10px] font-bold text-[#9A7B2E]">대표</span> : null}
            {row.inactive ? <span className="rounded-[6px] bg-[#F0ECE4] px-1.5 py-[2px] text-[10px] font-bold text-[#9A917F]">비활성</span> : null}
          </div>
        </div>
      </div>

      <div className="w-[150px] text-center text-[13px] font-semibold text-[#5B5345]">
        <span className="text-sage-deep">{row.count1on1}</span> · <span className="text-sage-deep">{row.count2on1}</span>
      </div>

      <div className="flex w-[220px] items-center justify-center gap-1.5">
        {row.inactive ? (
          <span className="text-[12px] font-medium text-[#B3AA9C]">단가 설정 불가</span>
        ) : (
          <>
            <RateInput value={r1} onChange={setR1} placeholder="1:1" />
            <RateInput value={r2} onChange={setR2} placeholder="2:1" />
            <button
              onClick={save}
              disabled={busy || !dirty}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-sage text-white transition disabled:opacity-30"
              aria-label="단가 저장"
            >
              <Icon name="check-bold" size={14} />
            </button>
          </>
        )}
      </div>

      <span className="w-[110px] text-right text-[15px] font-bold text-ink">{won(row.payout)}</span>
    </div>
  );
}

function RateInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      inputMode="numeric"
      maxLength={8}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 8))}
      placeholder={placeholder}
      className="w-[78px] rounded-[9px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-2 py-[7px] text-center text-[13px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]"
    />
  );
}
