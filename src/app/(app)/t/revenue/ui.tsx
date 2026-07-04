"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Field, MoneyInput, TextInput } from "@/components/ui/Field";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { addRevenue } from "@/lib/data/groups/owner-ops-actions";
import type { RevenueView } from "@/lib/data/groups/owner-ops";
import type { PaymentMethod } from "@/lib/types";

const won = (n: number) => "₩" + n.toLocaleString("ko-KR");
const todayStr = () => {
  const d = new Date(Date.now() + 9 * 3600000); // KST
  return d.toISOString().slice(0, 10);
};

export function RevenueClient({ view }: { view: RevenueView }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const won = Number(amount.replace(/[^\d]/g, ""));
    if (!won) return toast("금액을 입력해주세요", "error");
    setBusy(true);
    const res = await addRevenue({ amount: won, method, paidAt: date, note });
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "추가에 실패했어요", "error");
    toast("매출을 추가했어요");
    setOpen(false);
    setAmount("");
    setNote("");
    router.refresh();
  }

  function exportCsv() {
    const head = ["날짜", "항목", "결제수단", "금액"];
    const lines = [head];
    for (const m of view.months) for (const it of m.items) lines.push([it.date, it.label, it.methodLabel, String(it.amount)]);
    const csv = "﻿" + lines.map((r) => r.map((c) => `"${(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const file = new File([blob], `매출_${todayStr()}.csv`, { type: "text/csv" });
    const navAny = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (navAny.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: "매출 내보내기" }).catch(() => {});
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    // iOS Safari: anchor를 DOM에 붙여야 다운로드가 취소되지 않고, revoke는 클릭 후로 미룬다
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col break-keep">
      <Body>
        {/* header */}
        <div className="mb-4 flex items-center gap-3">
          <BackButton fallback="/t/perf" />
          <span className="text-[19px] font-bold text-ink">매출 장부</span>
          <button
            type="button"
            onClick={exportCsv}
            className="tappable ml-auto flex items-center gap-1 rounded-[11px] border border-ink/[0.1] bg-card px-3 py-1.5 text-[12.5px] font-bold text-sage-deep"
          >
            <Icon name="arrow-up-right" size={14} />
            내보내기
          </button>
        </div>

        {/* total */}
        <div className="mb-3 rounded-[18px] bg-sage p-5 text-surface">
          <div className="text-[12px] text-surface/85">전체 누적 매출</div>
          <div className="serif mt-1.5 text-[34px] leading-none">{won(view.totalAmount)}</div>
          <div className="mt-2 text-[12.5px] font-medium text-[#CDE0CF]">총 {view.totalCount}건</div>
        </div>

        {/* add toggle */}
        {open ? (
          <Card className="mb-4 flex flex-col gap-3 p-4">
            <Field icon="coins" label="금액" hint="원">
              <MoneyInput placeholder="50,000" value={amount} onValueChange={setAmount} />
            </Field>
            <Field icon="calendar" label="날짜">
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-muted5">결제수단</div>
              <SegmentedToggle
                options={[
                  { value: "card", label: "카드" },
                  { value: "cash", label: "현금" },
                  { value: "account", label: "계좌이체" },
                ]}
                value={method}
                onChange={setMethod}
              />
            </div>
            <Field icon="document-text" label="메모 (선택)">
              <PlainTextInput placeholder="일일권 · 물품 등" value={note} onChange={setNote} className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder" />
            </Field>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="tappable flex-1 rounded-[13px] border border-ink/[0.12] bg-card py-3 text-[14px] font-bold text-muted5"
              >
                취소
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="tappable flex-1 rounded-[13px] bg-sage py-3 text-[14px] font-bold text-surface disabled:opacity-60"
              >
                추가
              </button>
            </div>
          </Card>
        ) : (
          <div className="mb-4">
            <PrimaryButton icon="plus-bold" onClick={() => setOpen(true)}>
              매출 추가
            </PrimaryButton>
          </div>
        )}

        {/* monthly ledger */}
        {view.months.length === 0 ? (
          <Card className="p-6 text-center text-[13.5px] text-muted">
            아직 매출 기록이 없어요. ‘매출 추가’로 시작하세요.
          </Card>
        ) : (
          view.months.map((m) => (
            <div key={m.key} className="mb-5">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <Kicker>{m.label}</Kicker>
                <span className="text-[13px] font-bold text-ink">{won(m.total)}</span>
              </div>
              <Card className="overflow-hidden">
                {m.items.map((it, i) => (
                  <div
                    key={it.id}
                    className={`flex items-center gap-3 px-4 py-[13px] ${i > 0 ? "border-t border-ink/[0.06]" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-semibold text-ink">{it.label}</div>
                      <div className="mt-0.5 text-[12px] text-muted2">
                        {it.dateLabel} · {it.methodLabel}
                      </div>
                    </div>
                    <span className="flex-none text-[14px] font-bold text-ink">{won(it.amount)}</span>
                  </div>
                ))}
              </Card>
            </div>
          ))
        )}
        <div className="h-3.5" />
      </Body>
    </div>
  );
}
