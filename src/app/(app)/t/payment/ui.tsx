"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Field, TextInput } from "@/components/ui/Field";
import { Select } from "@/components/ui/Select";
import { PrimaryButton } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { recordPayments } from "@/lib/data/groups/owner-ops-actions";
import { composeDiscountLabel } from "@/lib/data/product-class";
import type { PaymentMethod, DiscountItem } from "@/lib/types";
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

export function PaymentClient({ summary, discounts }: { summary: PaymentSummary; discounts: DiscountItem[] }) {
  const router = useRouter();
  const toast = useToast();

  // 회원의 할인 자격을 기본 선택(변경 가능). 비활성화된 프리셋이어도 저장된 자격은 선택 유지.
  const [discountId, setDiscountId] = useState(summary.discount?.id ?? "");
  const discountOptions = [
    { value: "", label: "할인 없음" },
    ...discounts.map((d) => ({ value: d.id, label: composeDiscountLabel(d.name, d.amount) })),
    ...(summary.discount && !discounts.some((d) => d.id === summary.discount!.id)
      ? [{ value: summary.discount.id, label: composeDiscountLabel(summary.discount.name, summary.discount.amount) }]
      : []),
  ];
  const selectedDiscount =
    discounts.find((d) => d.id === discountId) ??
    (summary.discount && summary.discount.id === discountId ? summary.discount : null);
  const discountAmt = selectedDiscount?.amount ?? 0;
  const discountLabel = selectedDiscount
    ? composeDiscountLabel(selectedDiscount.name, selectedDiscount.amount)
    : undefined;

  // 초기 결제 금액: (미수금 > 전체 금액) − 할인액, 하한 0. 수정 가능 유지.
  const baseOwed =
    summary.outstanding != null ? summary.outstanding : summary.amount != null ? summary.amount : null;
  const defaultAmt = baseOwed != null ? String(Math.max(0, baseOwed - (summary.discount?.amount ?? 0))) : "";

  const [lines, setLines] = useState<{ method: PaymentMethod; amount: string }[]>([
    { method: "card", amount: defaultAmt },
  ]);
  const [payDate, setPayDate] = useState(todayStr());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // 할인 변경 시 결제 금액 재계산 — 단일 줄로 리셋(분할+할인 동시 편집은 드묾).
  function onDiscountChange(id: string) {
    setDiscountId(id);
    const amt =
      discounts.find((d) => d.id === id)?.amount ??
      (summary.discount?.id === id ? summary.discount.amount : 0);
    setLines((ls) => [
      { method: ls[0]?.method ?? "card", amount: baseOwed != null ? String(Math.max(0, baseOwed - amt)) : "" },
    ]);
  }

  const memberName = summary.memberName || "—";
  const product = summary.productLabel || "—";

  const totalEntered = lines.reduce((s, l) => s + parseAmt(l.amount), 0);
  // 미수 = (price − 할인액) − Σ기존결제 − Σ이번입력
  const remaining =
    summary.price != null
      ? summary.price - discountAmt - (summary.paid ?? 0) - totalEntered
      : null;

  async function onRecord() {
    if (pending) return;
    const hasAny = lines.some((l) => parseAmt(l.amount) > 0);
    if (!hasAny) { toast("금액을 입력해 주세요"); return; }
    setPending(true);
    const r = await recordPayments({
      memberId: summary.memberId ?? undefined,
      membershipId: summary.membershipId ?? undefined,
      paidAt: payDate || undefined,
      discountLabel, // 할인 라벨 스냅샷 → payments.discount_label
      lines: lines.map((l) => ({ method: l.method, amount: parseAmt(l.amount) })),
    });
    if (!r.ok) {
      toast(r.error ?? "결제 기록 실패");
      setPending(false);
      return;
    }
    toast("결제를 기록했어요");
    setPending(false);
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
          {selectedDiscount && (
            <div className="mt-1.5 text-[12.5px] font-semibold text-sage-deep">할인 {discountLabel}</div>
          )}
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

        {/* 특별 할인 — 회원 자격 기본 선택, 결제 금액 자동 차감(수정 가능) */}
        {discounts.length > 0 || summary.discount ? (
          <div className="mb-5">
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">특별 할인</div>
            <Select value={discountId} options={discountOptions} onChange={onDiscountChange} />
          </div>
        ) : null}

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
