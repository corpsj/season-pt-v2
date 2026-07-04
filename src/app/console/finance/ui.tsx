"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, ConsoleModal, won, pill } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { addExpense, deleteExpense } from "@/lib/data/groups/finance-actions";
import type { ExpenseItem } from "@/lib/data/groups/finance";

const CATS = [
  { v: "labor", l: "인건비" }, { v: "rent", l: "임대료" }, { v: "utility", l: "공과금" },
  { v: "marketing", l: "마케팅" }, { v: "supply", l: "소모품·장비" }, { v: "etc", l: "기타" },
] as const;
const CAT_LABEL: Record<string, string> = Object.fromEntries(CATS.map((c) => [c.v, c.l]));
const CAT_COLOR: Record<string, string> = {
  labor: "#768c6a", rent: "#b89a5e", utility: "#6e8aa0", marketing: "#c67352", supply: "#8fa187", etc: "#a89a80",
};
const FIELD = "w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]";
const kstToday = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);

export function ExpenseLedger({ items, staff }: { items: ExpenseItem[]; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [del, setDel] = useState<ExpenseItem | null>(null);
  // 폼
  const [category, setCategory] = useState<string>("etc");
  const [amount, setAmount] = useState("");
  const [spentAt, setSpentAt] = useState(kstToday());
  const [note, setNote] = useState("");
  const [trainerId, setTrainerId] = useState("");

  function reset() { setCategory("etc"); setAmount(""); setSpentAt(kstToday()); setNote(""); setTrainerId(""); }

  async function submit() {
    if (busy) return;
    const amt = amount.replace(/[^\d]/g, "");
    if (!amt) return toast("금액을 입력해주세요", "error");
    setBusy(true);
    const r = await addExpense({
      category: category as (typeof CATS)[number]["v"],
      amount: Number(amt),
      spentAt,
      note: note.trim() || undefined,
      trainerId: category === "labor" && trainerId ? trainerId : undefined,
    });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "지출 추가에 실패했어요", "error");
    toast("지출을 추가했어요");
    setOpen(false); reset(); router.refresh();
  }

  async function confirmDelete() {
    if (!del || busy) return;
    setBusy(true);
    const r = await deleteExpense(del.id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    toast("지출을 삭제했어요");
    setDel(null); router.refresh();
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[rgba(75,59,46,0.07)] px-[22px] py-4">
        <span className="text-[15px] font-bold text-ink">지출 내역</span>
        <span className="text-[12px] font-medium text-[#9A917F]">{items.length}건</span>
        <span className="ml-auto"><PBtn icon="plus-bold" className="!py-[10px]" onClick={() => { reset(); setOpen(true); }}>지출 추가</PBtn></span>
      </div>
      <div className="flex items-center border-b border-[rgba(75,59,46,0.06)] px-[22px] py-[11px] text-[11px] font-semibold tracking-[0.02em] text-[#A89F92]">
        <span className="w-[64px]">날짜</span><span className="flex-1">분류 · 메모</span><span className="w-[90px]">강사</span><span className="w-[120px] text-right">금액</span>
      </div>
      {items.length > 0 ? (
        items.map((it) => (
          <div key={it.id} className="flex items-center border-b border-[rgba(75,59,46,0.05)] px-[22px] py-3.5 last:border-b-0 hover:bg-[#FBFAF7]">
            <span className="w-[64px] text-[13px] font-semibold text-[#847A66]">{it.dateLabel}</span>
            <div className="flex flex-1 items-center gap-3">
              <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]" style={{ background: "#F4EFE6" }}>
                <span className="h-[9px] w-[9px] rounded-[3px]" style={{ background: CAT_COLOR[it.category] }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[13.5px] font-semibold text-ink">{CAT_LABEL[it.category]}</span>
                  {it.source === "settlement" ? <span style={pill("#5B6452", "#EDF4E3")}>정산 지급</span> : null}
                </div>
                {it.note ? <div className="text-[12px] font-medium text-[#9A917F]">{it.note}</div> : null}
              </div>
            </div>
            <span className="w-[90px] text-[12.5px] font-medium text-[#847A66]">{it.trainerName ?? "—"}</span>
            <Money className="w-[120px] text-right text-[14px] font-bold">{<span style={{ color: "#4B3B2E" }}>{won(it.amount)}</span>}</Money>
            {it.source !== "settlement" ? (
              <button onClick={() => setDel(it)} aria-label="삭제" className="ml-2 flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#F4EFE6] text-[#A89F92] transition hover:text-[#C67352]"><Icon name="circle-close" size={15} /></button>
            ) : <span className="ml-2 w-8" />}
          </div>
        ))
      ) : (
        <div className="px-5 py-12 text-center text-[13.5px] font-semibold text-[#847A66]">이번 달 지출이 없어요</div>
      )}

      {open ? (
        <ConsoleModal
          title="지출 추가"
          onClose={() => setOpen(false)}
          footer={<><OBtn className="flex-1" onClick={() => setOpen(false)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" pending={busy} onClick={submit}>추가</PBtn></>}
        >
          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">분류</div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={`mb-3.5 ${FIELD}`}>
            {CATS.map((c) => <option key={c.v} value={c.v}>{c.l}</option>)}
          </select>

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">금액</div>
          <input value={amount ? Number(amount.replace(/[^\d]/g, "")).toLocaleString("ko-KR") : ""} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 12))} inputMode="numeric" placeholder="₩ 금액" className={`mb-3.5 ${FIELD}`} />

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">날짜</div>
          <input type="date" value={spentAt} onChange={(e) => setSpentAt(e.target.value)} className={`mb-3.5 ${FIELD}`} />

          {category === "labor" ? (
            <>
              <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">강사 (선택)</div>
              <select value={trainerId} onChange={(e) => setTrainerId(e.target.value)} className={`mb-3.5 ${FIELD}`}>
                <option value="">선택 안 함</option>
                {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </>
          ) : null}

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">메모 (선택)</div>
          <PlainTextInput value={note} onChange={setNote} placeholder="예: 6월 임대료" className={FIELD} />
        </ConsoleModal>
      ) : null}

      {del ? (
        <ConsoleModal
          title="지출 삭제"
          onClose={() => setDel(null)}
          footer={<><OBtn className="flex-1" onClick={() => setDel(null)}>취소</OBtn><button onClick={confirmDelete} disabled={busy} className="flex-[1.6] rounded-[12px] bg-terracotta py-[11px] text-[14px] font-semibold text-white transition hover:brightness-105 disabled:opacity-50">삭제</button></>}
        >
          <div className="text-[14px] font-medium leading-relaxed text-[#5B5345]">이 지출 기록을 삭제할까요? 되돌릴 수 없어요.</div>
        </ConsoleModal>
      ) : null}
    </Card>
  );
}
