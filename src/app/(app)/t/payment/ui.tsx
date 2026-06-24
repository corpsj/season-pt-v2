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

export function PaymentClient({ summary }: { summary: PaymentSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [amount, setAmount] = useState(summary.amount != null ? String(summary.amount) : "");
  const [payDate, setPayDate] = useState(todayStr());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  const memberName = summary.memberName || "—";
  const product = summary.productLabel || "—";

  async function onRecord() {
    if (pending) return;
    setPending(true);
    const parsedAmount = amount ? Number(amount.replace(/[^\d]/g, "")) : undefined;
    const res = await recordPayment({
      memberId: summary.memberId ?? undefined,
      membershipId: summary.membershipId ?? undefined,
      method,
      amount: parsedAmount,
      paidAt: payDate || undefined,
    });
    if (!res.ok) {
      setPending(false);
      toast(res.error ?? "결제 기록에 실패했어요");
      return;
    }
    toast("결제를 기록했어요");
    if (summary.memberId) {
      router.push("/t/members/" + summary.memberId);
    } else {
      router.push("/t");
    }
    router.refresh();
  }

  const amountDisplay = amount
    ? `₩${Number(amount.replace(/[^\d]/g, "") || 0).toLocaleString()}`
    : "₩0";

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
          <div className="serif mt-1.5 text-[34px] leading-none text-ink">{amountDisplay}</div>
        </Card>

        <div className="mb-2 text-[12.5px] font-semibold text-muted5">결제수단</div>
        <SegmentedToggle
          className="mb-6"
          options={[
            { value: "cash", label: "현금" },
            { value: "card", label: "카드" },
            { value: "account", label: "계좌" },
          ]}
          value={method}
          onChange={setMethod}
        />

        <div className="mb-4 flex flex-col gap-3">
          <Field icon="calendar" label="결제일">
            <TextInput
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
            />
          </Field>
          <Field icon="coins" label="금액">
            <TextInput
              inputMode="numeric"
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </Field>
        </div>

        <Banner tone="neutral">PG 연동 전이라 수기로 기록해요.</Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton onClick={() => setConfirmOpen(true)}>결제 완료 기록</PrimaryButton>
      </Footer>

      <ConfirmDialog
        open={confirmOpen}
        title="결제를 기록할까요?"
        description={`${memberName} · ${product} · ${amountDisplay}`}
        confirmLabel="기록"
        onConfirm={() => { setConfirmOpen(false); onRecord(); }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
