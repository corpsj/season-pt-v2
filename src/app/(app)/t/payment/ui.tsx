"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { recordPayment } from "@/lib/data/groups/owner-ops-actions";
import type { PaymentMethod } from "@/lib/types";
import type { PaymentSummary } from "@/lib/data/groups/owner-ops";

export function PaymentClient({ summary }: { summary: PaymentSummary }) {
  const router = useRouter();
  const toast = useToast();
  const [method, setMethod] = useState<PaymentMethod>("card");
  const [pending, setPending] = useState(false);

  const memberName = summary.memberName || "이지수";
  const product = summary.productLabel || "20회권";
  const amountText =
    summary.amount != null ? `₩${summary.amount.toLocaleString()}` : "₩1,400,000";

  async function onRecord() {
    if (pending) return;
    setPending(true);
    const res = await recordPayment({
      memberId: summary.memberId ?? undefined,
      membershipId: summary.membershipId ?? undefined,
      method,
    });
    if (!res.ok) {
      setPending(false);
      toast(res.error ?? "결제 기록에 실패했어요");
      return;
    }
    toast("결제를 기록했어요");
    router.push("/t");
    router.refresh();
  }

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
          <div className="serif mt-1.5 text-[34px] font-semibold leading-none text-ink">{amountText}</div>
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

        <Card className="mb-4 overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-[14px]">
            <Icon name="calendar" size={18} className="flex-none text-sage" />
            <span className="flex-1 text-[12.5px] font-semibold text-muted5">결제일</span>
            <span className="text-[14px] font-bold text-ink">{summary.payDateLabel}</span>
          </div>
          <div className="flex items-center gap-2.5 border-t border-ink/[0.07] px-4 py-[14px]">
            <Icon name="coins" size={18} className="flex-none text-sage" />
            <span className="flex-1 text-[12.5px] font-semibold text-muted5">금액</span>
            <span className="text-[14px] font-bold text-ink">{amountText}</span>
          </div>
        </Card>

        <Banner tone="neutral">PG 연동 전이라 수기로 기록해요.</Banner>
        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton onClick={onRecord}>결제 완료 기록</PrimaryButton>
      </Footer>
    </div>
  );
}
