"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, TextInput } from "@/components/ui/Field";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Select } from "@/components/ui/Select";
import { RadioOption } from "@/components/ui/RadioOption";
import { Card } from "@/components/ui/Card";
import { PrimaryButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { createMember } from "@/lib/data/groups/owner-ops-actions";
import type { Gender, PaymentMethod, MembershipProduct, StaffMember } from "@/lib/types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];
const TIME_OPTIONS = [18, 19, 20, 21];

const todayStr = () => {
  const d = new Date(Date.now() + 9 * 3600000); // KST
  return d.toISOString().slice(0, 10);
};

export function MemberRegisterClient({
  ownerName,
  ownerId,
  products,
  staff,
}: {
  ownerName: string;
  ownerId: string;
  products: MembershipProduct[];
  staff: StaffMember[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [days, setDays] = useState<Set<number>>(new Set([3, 6]));
  const [timeIdx, setTimeIdx] = useState(1); // 19시
  const [trainerId, setTrainerId] = useState(ownerId);
  const [selectedProduct, setSelectedProduct] = useState<string | "later">("later");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("card");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [pending, setPending] = useState(false);

  // When product changes, pre-fill amount from product price
  function onProductChange(id: string | "later") {
    setSelectedProduct(id);
    if (id !== "later") {
      const p = products.find((p) => p.id === id);
      if (p) setPayAmount(String(p.price));
    } else {
      setPayAmount("");
    }
  }

  async function onSubmit() {
    if (pending) return;
    setPending(true);
    const productArg =
      selectedProduct !== "later" ? { productId: selectedProduct } : undefined;
    const paymentArg =
      selectedProduct !== "later"
        ? {
            method: payMethod,
            amount: payAmount ? Number(payAmount.replace(/[^\d]/g, "")) : undefined,
            paidAt: payDate || undefined,
          }
        : undefined;
    const res = await createMember({
      name,
      phone,
      birth,
      gender,
      weekdays: [...days].sort((a, b) => a - b),
      hour: TIME_OPTIONS[timeIdx],
      trainerId,
      product: productArg,
      payment: paymentArg,
    });
    if (!res.ok) {
      setPending(false);
      toast(res.error ?? "회원 등록에 실패했어요");
      return;
    }
    toast("회원을 등록했어요");
    router.push("/t/members/" + res.memberId);
    router.refresh();
  }

  function toggleDay(i: number) {
    setDays((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }
  function cycleTime() {
    setTimeIdx((i) => (i + 1) % TIME_OPTIONS.length);
  }

  const regTime = `${TIME_OPTIONS[timeIdx]}시`;
  const selectedDays = [...days].sort((a, b) => a - b).map((d) => DAYS[d]);
  const regSummary =
    selectedDays.length > 0 ? `${regTime} · 매주 ${selectedDays.join("·")}` : `${regTime} · 요일을 선택해 주세요`;

  const staffOptions = staff
    .filter((s) => s.role !== "invited")
    .map((s) => ({ value: s.id, label: s.name }));

  const productOptions = [
    ...products.map((p) => ({ value: p.id, label: `${p.name} · ₩${p.price.toLocaleString()}` })),
    { value: "later", label: "나중에 발급" },
  ];

  const selectedProductData = products.find((p) => p.id === selectedProduct);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/settings" />
          <span className="text-[19px] font-bold text-ink">회원 등록</span>
        </div>

        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="이름">
            <TextInput placeholder="윤서아" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field icon="phone" label="연락처 (아이디)">
            <TextInput
              type="tel"
              inputMode="tel"
              placeholder="010-0000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
          <Field icon="lock" label="생년월일 (초기 비밀번호)" hint="YYMMDD">
            <TextInput
              inputMode="numeric"
              placeholder="000000"
              value={birth}
              onChange={(e) => setBirth(e.target.value)}
            />
          </Field>

          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">성별</div>
            <SegmentedToggle
              options={[
                { value: "female", label: "여성" },
                { value: "male", label: "남성" },
              ]}
              value={gender}
              onChange={setGender}
            />
          </div>

          {/* 담당 강사 */}
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">담당 강사</div>
            <Select
              value={trainerId}
              options={staffOptions}
              onChange={setTrainerId}
            />
          </div>
        </div>

        <div className="mb-2.5 mt-6">
          <Kicker>정기 수업 요일</Kicker>
        </div>
        <div className="mb-3 flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = days.has(i);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDay(i)}
                className={`tappable flex-1 rounded-[11px] py-[10px] text-center text-[13px] font-bold ${
                  on
                    ? "bg-sage text-surface"
                    : i === 0
                      ? "bg-sage-banner text-sunday font-semibold"
                      : "bg-sage-banner text-muted5 font-semibold"
                }`}
              >
                {d}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={cycleTime}
          className="tappable mb-4 flex w-full items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-4 py-[15px] text-left"
        >
          <Icon name="clock" size={19} className="flex-none text-sage-soft" />
          <span className="flex-1 text-[14px] font-medium text-ink">{regSummary}</span>
          <Icon name="refresh" size={16} className="flex-none text-chevron" />
        </button>

        <Banner tone="neutral">매주 같은 요일·시간에 수업이 자동 생성돼요.</Banner>

        {/* 회원권 상품 선택 */}
        <div className="mb-2.5 mt-6">
          <Kicker>회원권 상품</Kicker>
        </div>
        <div className="mb-4 flex flex-col gap-2.5">
          {products.map((p) => (
            <RadioOption
              key={p.id}
              selected={selectedProduct === p.id}
              onClick={() => onProductChange(p.id)}
              right={
                <span className="flex-none text-[14px] font-bold text-ink">
                  ₩{p.price.toLocaleString()}
                </span>
              }
            >
              <span className="text-[14px] font-bold text-ink">{p.name}</span>
            </RadioOption>
          ))}
          <RadioOption
            selected={selectedProduct === "later"}
            onClick={() => onProductChange("later")}
          >
            <span className="text-[14px] font-semibold text-muted">나중에 발급</span>
          </RadioOption>
        </div>

        {/* 결제 정보 (상품 선택 시) */}
        {selectedProduct !== "later" && selectedProductData && (
          <Card className="mb-4 flex flex-col gap-3 p-4">
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-muted5">결제수단</div>
              <SegmentedToggle
                options={[
                  { value: "cash", label: "현금" },
                  { value: "card", label: "카드" },
                  { value: "account", label: "계좌" },
                ]}
                value={payMethod}
                onChange={setPayMethod}
              />
            </div>
            <Field icon="coins" label="금액">
              <TextInput
                inputMode="numeric"
                placeholder={String(selectedProductData.price)}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
              />
            </Field>
            <Field icon="calendar" label="결제일">
              <TextInput
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
              />
            </Field>
          </Card>
        )}

        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="person-plus" onClick={onSubmit}>
          회원 등록
        </PrimaryButton>
      </Footer>
    </div>
  );
}
