"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Field, TextInput } from "@/components/ui/Field";
import { PrimaryButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { recordPayment } from "@/lib/data/groups/owner-ops-actions";
import type { PaymentMethod } from "@/lib/types";
import type { PaymentSummary } from "@/lib/data/groups/owner-ops";

const todayStr = () => {
  const d = new Date(Date.now() + 9 * 3600000); // KST
  return d.toISOString().slice(0, 10);
};

const METHOD_OPTS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "현금" },
  { value: "card", label: "카드" },
  { value: "account", label: "계좌" },
];

function parseAmt(s: string) {
  return Number(s.replace(/[^\d]/g, "")) || 0;
}

export function PaymentClient({ summary }: { summary: PaymentSummary }) {
  const router = useRouter();
  const toast = useToast();

  // 초기 금액: 미수금 > 전체 금액 > 빈 값 순
  const defaultAmt =
    summary.outstanding != null
      ? String(summary.outstanding)
      : summary.amount != null
        ? String(summary.amount)
        : "";

  const [lines, setLines] = useState<{ method: PaymentMethod; amount: string }[]>([
    { method: "card", amount: defaultAmt },
  ]);
  const [payDate, setPayDate] = useState(todayStr());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const memberName = summary.memberName || "—";
  const product = summary.productLabel || "—";

  const totalEntered = lines.reduce((s, l) => s + parseAmt(l.amount), 0);
  // 미수 = price − Σ기존결제 − Σ이번입력
  const remaining =
    summary.price != null
      ? summary.price - (summary.paid ?? 0) - totalEntered
      : null;

  async function onRecord() {
    if (pending) return;
    setPending(true);
    for (const l of lines) {
      const amt = parseAmt(l.amount);
      if (amt <= 0) continue;
      const r = await recordPayment({
        memberId: summary.memberId ?? undefined,
        membershipId: summary.membershipId ?? undefined,
        method: l.method,
        amount: amt,
        paidAt: payDate || undefined,
      });
      if (!r.ok) {
        toast(r.error ?? "결제 기록 실패");
        setPending(false);
        return;
      }
    }
    toast("결제를 기록했어요");
    if (summary.memberId) {
      router.push("/t/members/" + summary.memberId);
    } else {
      router.push("/t");
    }
    router.refresh();
  }

  const totalDisplay = `₩${totalEntered.toLocaleString()}`;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton />
          <span className="text-[19px] font-bold text-ink">결제 기록</span>
        </div>

        {/* summary card */}
        <Card className="mb-6 px-[18px] py-5">
          <div className="text-[13px] font-medium text-muted">
            {memberName} · {product}
          </div>
          <div className="serif mt-1.5 text-[34px] leading-none text-ink">{totalDisplay}</div>
          {remaining != null && (
            <div
              className={`mt-2 text-[12.5px] font-semibold ${
                remaining < 0 ? "text-terracotta" : "text-muted"
              }`}
            >
              결제 후 미수금 ₩{Math.abs(remaining).toLocaleString()}
              {remaining < 0 ? " (초과)" : ""}
            </div>
          )}
        </Card>

        {/* 결제일 공통 */}
        <Field icon="calendar" label="결제일" className="mb-5">
          <TextInput
            type="date"
            value={payDate}
            onChange={(e) => setPayDate(e.target.value)}
          />
        </Field>

        {/* 결제 줄별 */}
        <div className="flex flex-col gap-3">
          {lines.map((line, i) => (
            <Card key={i} className="px-4 py-4">
              {lines.length > 1 && (
                <div className="mb-2 text-[12px] font-semibold text-muted5">
                  {i + 1}번 결제
                </div>
              )}
              <SegmentedToggle
                className="mb-3"
                options={METHOD_OPTS}
                value={line.method}
                onChange={(v) =>
                  setLines((ls) =>
                    ls.map((l, j) => (j === i ? { ...l, method: v } : l))
                  )
                }
              />
              <Field icon="coins" label="금액">
                <TextInput
                  inputMode="numeric"
                  placeholder="0"
                  value={line.amount}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((l, j) =>
                        j === i ? { ...l, amount: e.target.value } : l
                      )
                    )
                  }
                />
              </Field>
            </Card>
          ))}
        </div>

        <button
          type="button"
          className="mt-3 text-[13px] font-semibold text-sage"
          onClick={() => setLines((ls) => [...ls, { method: "card", amount: "" }])}
        >
          + 결제 줄 추가
        </button>

        <div className="mt-5">
          <Banner tone="neutral">PG 연동 전이라 수기로 기록해요.</Banner>
        </div>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton onClick={() => setConfirmOpen(true)}>결제 완료 기록</PrimaryButton>
      </Footer>

      <ConfirmDialog
        open={confirmOpen}
        title="결제를 기록할까요?"
        description={`${memberName} · ${product} · ${totalDisplay}`}
        confirmLabel="기록"
        onConfirm={() => {
          setConfirmOpen(false);
          onRecord();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
