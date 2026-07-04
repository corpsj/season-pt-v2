"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Avatar } from "@/components/ui/Avatar";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, PBtn, OBtn, GBtn, ConsoleModal, won, pill } from "@/components/console/ui";
import { Money } from "@/components/console/privacy";
import { recordPayment, recordPayments, addRevenue, deletePayment } from "@/lib/data/groups/owner-ops-actions";
import { undoRefund } from "@/lib/data/groups/membership-actions";
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
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Kind>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const list = items.filter((it) => filter === "all" || classify(it) === filter);

  // 결제 오입력 정정(감사 H2): 환불(음수) 행은 회원권 환불로만 처리하므로 삭제 버튼을 숨긴다.
  async function remove(id: string) {
    if (busy) return;
    if (!(await confirm({ title: "이 결제 기록을 삭제할까요?", description: "매출·미수금·손익에서 제외돼요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(id);
    const r = await deletePayment(id);
    setBusy(null);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    toast("결제 기록을 삭제했어요");
    router.refresh();
  }

  // 환불 취소(undoRefund, 감사3 #8): 오클릭·금액 오류로 환불한 건을 스냅샷 상태로 복원.
  async function undo(membershipId: string, rowId: string) {
    if (busy) return;
    if (!(await confirm({ title: "이 환불을 취소할까요?", description: "회원권이 환불 전 상태로 복원돼요.", confirmLabel: "환불 취소" }))) return;
    setBusy(rowId);
    const r = await undoRefund(membershipId);
    setBusy(null);
    toast(r.ok ? "환불을 취소했어요. 정기 수업이 있었다면 스케줄을 다시 켜주세요." : (r.error ?? "취소에 실패했어요"), r.ok ? "success" : "error");
    if (r.ok) router.refresh();
  }

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
        <span className="w-[64px]">날짜</span><span className="flex-1">회원 · 항목</span><span className="w-[74px]">수단</span><span className="w-[120px] text-right">금액</span><span className="w-[34px]" />
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
              <span className="w-[34px] text-right">
                {refund ? (
                  it.membershipId ? (
                    <button
                      type="button"
                      aria-label="환불 취소"
                      title="환불 취소"
                      disabled={busy === it.id}
                      onClick={() => undo(it.membershipId!, it.id)}
                      className="tappable inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#B3AA9C] transition hover:bg-[#EDF4E3] hover:text-[#5B6452] disabled:opacity-40"
                    >
                      <Icon name="refresh" size={15} />
                    </button>
                  ) : null
                ) : (
                  <button
                    type="button"
                    aria-label="결제 삭제"
                    disabled={busy === it.id}
                    onClick={() => remove(it.id)}
                    className="tappable inline-flex h-7 w-7 items-center justify-center rounded-[8px] text-[#B3AA9C] transition hover:bg-[#F4EFE6] hover:text-[#C67352] disabled:opacity-40"
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
              </span>
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
    // iOS Safari: anchor를 DOM에 붙여야 다운로드가 취소되지 않고, revoke는 클릭 후로 미룬다
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // 분할 결제(카드+현금 등) — 회원 결제 모드에서 여러 줄로 기록(모바일 결제 화면과 동일).
  const [lines, setLines] = useState<{ method: PaymentMethod; amount: string }[]>([{ method: "card", amount: "" }]);

  const list = members.filter((m) => q.trim() === "" || m.name.includes(q.trim())).slice(0, 40);

  function reset() {
    setMode("member"); setQ(""); setMemberId(""); setAmount(""); setMethod("card"); setNote("");
    setLines([{ method: "card", amount: "" }]);
  }
  async function submit() {
    if (busy) return;
    if (mode === "member") {
      if (!memberId) return toast("회원을 선택해주세요", "error");
      const parsed = lines.map((l) => ({ method: l.method, amount: Number(l.amount.replace(/[^\d]/g, "") || "0") }));
      setBusy(true);
      // 한 줄이고 금액을 비웠으면 기존 동작(회원권 정가) 유지, 그 외엔 다건 일괄 기록.
      const r =
        parsed.length === 1 && parsed[0].amount === 0
          ? await recordPayment({ memberId, method: parsed[0].method })
          : await recordPayments({ memberId, lines: parsed });
      setBusy(false);
      if (!r.ok) return toast(r.error ?? "결제 기록에 실패했어요", "error");
    } else {
      const amt = amount.replace(/[^\d]/g, "");
      if (!amt) return toast("금액을 입력해주세요", "error");
      setBusy(true);
      const r = await addRevenue({ amount: Number(amt), method, note: note.trim() || undefined });
      setBusy(false);
      if (!r.ok) return toast(r.error ?? "매출 추가에 실패했어요", "error");
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
                {q ? <button type="button" onClick={() => setQ("")} aria-label="지우기" className="flex-none text-[#C2BAAD]"><Icon name="circle-close" size={16} /></button> : null}
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

          {mode === "member" ? (
            <>
              {/* 분할 결제 줄 — 수단+금액을 여러 줄로(카드+현금 등) */}
              {lines.map((line, i) => (
                <div key={i} className="mb-2.5 rounded-[13px] border border-[rgba(75,59,46,0.1)] bg-[#FBFAF7] p-3">
                  {lines.length > 1 ? (
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-[11.5px] font-semibold text-[#9A917F]">{i + 1}번 결제</span>
                      <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-[12px] font-semibold text-terracotta">삭제</button>
                    </div>
                  ) : null}
                  <div className="mb-2 flex gap-2">
                    {METHODS.map((m) => (
                      <button key={m.v} onClick={() => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, method: m.v } : l)))} className={`flex-1 rounded-[11px] py-[9px] text-[12.5px] font-semibold transition ${line.method === m.v ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}>{m.l}</button>
                    ))}
                  </div>
                  <input
                    value={line.amount ? Number(line.amount.replace(/[^\d]/g, "")).toLocaleString("ko-KR") : ""}
                    onChange={(e) => { const d = e.target.value.replace(/[^\d]/g, "").slice(0, 12); setLines((ls) => ls.map((l, j) => (j === i ? { ...l, amount: d } : l))); }}
                    inputMode="numeric"
                    placeholder={lines.length === 1 ? "₩ 금액 (비우면 회원권 정가)" : "₩ 금액"}
                    className="w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-white px-[15px] py-[11px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]"
                  />
                </div>
              ))}
              <button type="button" onClick={() => setLines((ls) => [...ls, { method: "cash", amount: "" }])} className="w-full rounded-[12px] border border-dashed border-[rgba(75,59,46,0.2)] bg-white py-[10px] text-[12.5px] font-semibold text-[#766D60] transition hover:bg-[#FBF9F5]">
                + 분할 결제 추가
              </button>
            </>
          ) : (
            <>
              <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">금액</div>
              <input value={amount ? Number(amount.replace(/[^\d]/g, "")).toLocaleString("ko-KR") : ""} onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, "").slice(0, 12))} inputMode="numeric" placeholder="₩ 금액" className="mb-3.5 w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none placeholder:text-[#B3AA9C]" />
              <div className="mb-1.5 text-[11.5px] font-semibold text-[#9A917F]">결제 수단</div>
              <div className="flex gap-2">
                {METHODS.map((m) => (
                  <button key={m.v} onClick={() => setMethod(m.v)} className={`flex-1 rounded-[11px] py-[11px] text-[13px] font-semibold transition ${method === m.v ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"}`}>{m.l}</button>
                ))}
              </div>
            </>
          )}
        </ConsoleModal>
      ) : null}
    </>
  );
}
