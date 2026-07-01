"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { Card, won, PBtn, OBtn, ConsoleModal } from "@/components/console/ui";
import { setTrainerRates } from "@/lib/data/groups/settlement-actions";
import { confirmSettlement, unconfirmSettlement } from "@/lib/data/groups/finance-actions";
import type { Settlement, SettlementRow } from "@/lib/data/groups/settlement";

export function SettlementClient({ settlement }: { settlement: Settlement }) {
  const { monthOffset, monthLabel, rows, total, confirmed } = settlement;

  return (
    <>
      {/* month nav + total */}
      <div className="mb-5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <NavArrow to={monthOffset + 1} dir="prev" />
          <span className="min-w-[104px] text-center text-[15px] font-bold text-ink">{monthLabel}</span>
          <NavArrow to={monthOffset - 1} dir="next" disabled={monthOffset <= 0} />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-baseline gap-2 rounded-[14px] bg-[#26231E] px-5 py-3">
            <span className="text-[12.5px] font-semibold text-[#CFC7B8]">이 달 지급 합계</span>
            <span className="text-[20px] font-bold text-surface">{won(total)}</span>
          </div>
          <ConfirmControl monthOffset={monthOffset} confirmed={confirmed} rows={rows} />
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
          정산은 해당 월에 <b className="font-semibold text-[#5B5345]">실제 진행(출석 확정)된 수업</b> 기준이에요. 2:1 팀 수업은 1회로 계산돼요. 지급액은 <b className="font-semibold text-[#5B5345]">각 수업 진행 시점의 단가</b>로 계산되며, 단가를 바꿔도 지난 정산은 바뀌지 않아요(다음 진행분부터 적용).{" "}<b className="font-semibold text-[#5B5345]">지급 확정</b>하면 이 달 인건비가 <b className="font-semibold text-[#5B5345]">손익</b> 화면에 지출로 반영돼요.
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

function ConfirmControl({
  monthOffset,
  confirmed,
  rows,
}: {
  monthOffset: number;
  confirmed: boolean;
  rows: SettlementRow[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<null | "confirm" | "unconfirm">(null);

  // 지급 대상 = 비오너 & payout>0. 0이면 확정할 인건비가 없어 컨트롤 숨김(대표 단독/무진행 달 no-op 방지).
  const payableCount = rows.filter((r) => r.payout > 0 && r.role !== "owner").length;

  async function run(kind: "confirm" | "unconfirm") {
    if (busy) return;
    setBusy(true);
    const res = kind === "confirm" ? await confirmSettlement(monthOffset) : await unconfirmSettlement(monthOffset);
    setBusy(false);
    if (!res.ok) {
      setModal(null);
      return toast(res.error ?? (kind === "confirm" ? "확정에 실패했어요" : "취소에 실패했어요"));
    }
    toast(kind === "confirm" ? "지급을 확정했어요" : "확정을 취소했어요");
    setModal(null);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {confirmed ? (
        <>
          <span className="inline-flex items-center gap-1 rounded-[10px] bg-[#EDF4E3] px-2.5 py-1.5 text-[12.5px] font-bold text-[#5B6452]">
            <Icon name="check-bold" size={14} />지급 완료
          </span>
          <button
            onClick={() => setModal("unconfirm")}
            className="rounded-[10px] px-2.5 py-1.5 text-[12.5px] font-semibold text-[#9A917F] transition hover:bg-[#F4F0E8]"
          >
            확정 취소
          </button>
        </>
      ) : payableCount > 0 ? (
        <PBtn icon="check-bold" onClick={() => setModal("confirm")}>지급 확정</PBtn>
      ) : null}

      {modal === "confirm" ? (
        <ConsoleModal
          title="지급 확정"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={() => run("confirm")}>지급 확정</PBtn></>}
        >
          <p className="text-[13.5px] leading-relaxed text-[#766D60]">이 달 정산을 지급 확정할까요? <b className="text-ink">인건비 지출</b>로 반영돼요.</p>
        </ConsoleModal>
      ) : null}

      {modal === "unconfirm" ? (
        <ConsoleModal
          title="확정 취소"
          onClose={() => setModal(null)}
          footer={<><OBtn className="flex-1" onClick={() => setModal(null)}>닫기</OBtn><button onClick={() => run("unconfirm")} disabled={busy} className="flex-[1.6] rounded-[12px] bg-terracotta py-[11px] text-[14px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50">확정 취소</button></>}
        >
          <p className="text-[13.5px] leading-relaxed text-[#766D60]">이 달 정산 확정을 취소할까요? 반영된 <b className="text-ink">인건비 지출</b>이 삭제돼요.</p>
        </ConsoleModal>
      ) : null}
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
