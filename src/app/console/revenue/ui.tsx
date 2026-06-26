"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, GBtn, ConsoleModal, won, pill } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { recordPayment, addRevenue } from "@/lib/data/groups/owner-ops-actions";
import type { RevenueEntry } from "@/lib/data/groups/owner-ops";
import type { AvatarTone, PaymentMethod } from "@/lib/types";

type Kind = "all" | "membership" | "etc" | "refund";
const FILTERS: { k: Kind; l: string }[] = [
  { k: "all", l: "전체" },
  { k: "membership", l: "회원권" },
  { k: "etc", l: "기타" },
  { k: "refund", l: "환불" },
];
const METHODS: { v: PaymentMethod; l: string }[] = [
  { v: "card", l: "카드" },
  { v: "cash", l: "현금" },
  { v: "account", l: "계좌이체" },
];

function classify(it: RevenueEntry): Kind {
  if (it.amount < 0) return "refund";
  if (it.label.includes("회권")) return "membership";
  return "etc";
}

export function RevenueLedger({ items }: { items: RevenueEntry[] }) {
  const [filter, setFilter] = useState<Kind>("all");
  const list = items.filter((it) => filter === "all" || classify(it) === filter);

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2.5 border-b border-[rgba(75,59,46,0.07)] px-[22px] py-4">
        <span className="text-[15px] font-bold text-ink">거래 내역</span>
        <span className="text-[12px] font-medium text-[#9A917F]">{list.length}건</span>
        <div className="ml-auto flex gap-1.5">
          {FILTERS.map((f) => {
            const on = filter === f.k;
            return (
              <button key={f.k} onClick={() => setFilter(f.k)} className={`rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold transition ${on ? "bg-ink text-white" : "bg-[#F4EFE6] text-[#766D60]"}`}>{f.l}</button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center border-b border-[rgba(75,59,46,0.06)] px-[22px] py-[11px] text-[11px] font-semibold tracking-[0.02em] text-[#A89F92]">
        <span className="w-[64px]">날짜</span><span className="flex-1">회원 · 항목</span><span className="w-[74px]">수단</span><span className="w-[120px] text-right">금액</span>
      </div>
      {list.length > 0 ? (
        list.map((it) => {
          const refund = it.amount < 0;
          return (
            <div key={it.id} className="flex items-center border-b border-[rgba(75,59,46,0.05)] px-[22px] py-3.5 last:border-b-0 hover:bg-[#FBFAF7]">
              <span className="w-[64px] text-[13px] font-semibold text-[#847A66]">{it.dateLabel}</span>
              <div className="flex flex-1 items-center gap-3">
                <div className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px]" style={{ background: refund ? "#FBF3E9" : "#EDF4E3" }}>
                  <Icon name={refund ? "coins" : "ticket-fill"} size={17} style={{ color: refund ? "#C67352" : "#6B785E" }} />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[13.5px] font-semibold text-ink">{it.label}</span>
                    {refund ? <span style={pill("#C67352", "#FBF3E9")}>환불</span> : null}
                  </div>
                </div>
              </div>
              <span className="w-[74px]"><span className="rounded-[7px] bg-[#F4EFE6] px-2.5 py-1 text-[11.5px] font-semibold text-[#5B5345]">{it.methodLabel}</span></span>
              <Money className="w-[120px] text-right text-[14px] font-bold" >{<span style={{ color: refund ? "#C67352" : "#4B3B2E" }}>{won(it.amount)}</span>}</Money>
            </div>
          );
        })
      ) : (
        <div className="px-5 py-12 text-center text-[13.5px] font-semibold text-[#847A66]">해당 유형의 거래가 없어요</div>
      )}
    </Card>
  );
}

export function ExportButton({ monthLabel, items }: { monthLabel: string; items: RevenueEntry[] }) {
  function exportCsv() {
    const header = "날짜,항목,결제수단,금액\n";
    const rows = items.map((it) => `${it.date},"${it.label.replace(/"/g, '""')}",${it.methodLabel},${it.amount}`).join("\n");
    const blob = new Blob(["﻿" + header + rows], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `매출_${monthLabel.replace(/\s/g, "")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return <GBtn icon="document-text" className="ml-auto !py-[10px]" onClick={exportCsv}>내보내기</GBtn>;
}

export function PayRecordButton({ members }: { members: { id: string; name: string; initial: string; avatarTone: AvatarTone }[] }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"member" | "etc">("member");
  const [q, setQ] = useState("");
  const [memberId, setMemberId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [note, setNote] = useState("");

  const list = members.filter((m) => q.trim() === "" || m.name.includes(q.trim())).slice(0, 40);

  function reset() {
    setMode("member"); setQ(""); setMemberId(""); setAmount(""); setMethod("card"); setNote("");
  }
  async function submit() {
    if (busy) return;
    const amt = amount.replace(/[^\d]/g, "");
    if (mode === "member") {
      if (!memberId) return toast("회원을 선택해주세요");
      setBusy(true);
      const r = await recordPayment({ memberId, method, amount: amt ? Number(amt) : undefined });
      setBusy(false);
      if (!r.ok) return toast(r.error ?? "결제 기록에 실패했어요");
    } else {
      if (!amt) return toast("금액을 입력해주세요");
      setBusy(true);
      const r = await addRevenue({ amount: Number(amt), method, note: note.trim() || undefined });
      setBusy(false);
      if (!r.ok) return toast(r.error ?? "매출 추가에 실패했어요");
    }
    toast("결제를 기록했어요");
    setOpen(false);
    reset();
    router.refresh();
  }

  return (
    <>
      <PBtn icon="plus-bold" className="!py-[10px]" onClick={() => { reset(); setOpen(true); }}>결제 기록</PBtn>
      {open ? (
        <ConsoleModal
          title="결제 기록"
          onClose={() => setOpen(false)}
          footer={<><OBtn className="flex-1" onClick={() => setOpen(false)}>취소</OBtn><PBtn icon="check-bold" className="flex-[1.6]" disabled={busy} onClick={submit}>기록</PBtn></>}
        >
          <div className="mb-3.5 flex gap-2">
            {([["member", "회원 결제"], ["etc", "기타 매출"]] as const).map(([m, l]) => (
              <button key={m} onClick={() => setMode(m)} className={`flex-1 rounded-[11px] py-[10px] text-[13px] font-semibold transition ${mode === m ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}>{l}</button>
            ))}
          </div>

          {mode === "member" ? (
            <>
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">회원 선택</div>
              <div className="mb-2 flex items-center gap-2 rounded-[11px] border border-[rgba(75,59,46,0.12)] bg-[#FBF9F5] px-3 py-2.5">
                <Icon name="search" size={16} className="text-[#A89F92]" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 검색" className="w-full bg-transparent text-[13.5px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />
              </div>
              <div className="mb-3.5 max-h-[180px] overflow-y-auto rounded-[12px] border border-[rgba(75,59,46,0.08)]">
                {list.map((m) => (
                  <button key={m.id} onClick={() => setMemberId(m.id)} className={`flex w-full items-center gap-2.5 border-b border-[rgba(75,59,46,0.05)] px-3 py-2.5 text-left last:border-b-0 transition ${memberId === m.id ? "bg-[#EDF4E3]" : "hover:bg-[#FBFAF7]"}`}>
                    <Avatar initial={m.initial} tone={m.avatarTone} size={32} />
                    <span className="flex-1 text-[13.5px] font-semibold text-ink">{m.name}</span>
                    {memberId === m.id ? <Icon name="check-bold" size={15} className="text-sage-deep" /> : null}
                  </button>
                ))}
                {list.length === 0 ? <div className="px-3 py-6 text-center text-[12.5px] font-medium text-[#A89F92]">회원이 없어요</div> : null}
              </div>
            </>
          ) : (
            <>
              <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">항목 메모</div>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="예: 용품 판매" className="mb-3.5 w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />
            </>
          )}

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">금액 {mode === "member" ? "(비우면 회원권 정가)" : ""}</div>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="₩ 금액" className="mb-3.5 w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />

          <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">결제 수단</div>
          <div className="flex gap-2">
            {METHODS.map((m) => (
              <button key={m.v} onClick={() => setMethod(m.v)} className={`flex-1 rounded-[11px] py-[11px] text-[13px] font-semibold transition ${method === m.v ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}>{m.l}</button>
            ))}
          </div>
        </ConsoleModal>
      ) : null}
    </>
  );
}
