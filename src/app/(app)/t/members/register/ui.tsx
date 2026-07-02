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
import { useToast } from "@/components/ui/Toast";
import { createMember } from "@/lib/data/groups/owner-ops-actions";
import { productType, tierMatches, isDiscountProduct } from "@/lib/data/product-class";
import type { Gender, PaymentMethod, MembershipProduct, DiscountItem } from "@/lib/types";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

function hourLabel(h: number) {
  if (h < 12) return `오전 ${h}시`;
  if (h === 12) return "오후 12시";
  return `오후 ${h - 12}시`;
}
const HOUR_OPTIONS = Array.from({ length: 17 }, (_, i) => ({ value: String(i + 6), label: hourLabel(i + 6) }));
const MINUTE_OPTIONS = [{ value: "0", label: "정각" }, { value: "30", label: "30분" }];

const todayStr = () => {
  const d = new Date(Date.now() + 9 * 3600000); // KST
  return d.toISOString().slice(0, 10);
};

export function MemberRegisterClient({
  ownerId,
  products,
  trainers,
  discounts,
}: {
  ownerId: string;
  products: MembershipProduct[];
  trainers: { id: string; name: string }[];
  discounts: DiscountItem[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  const [dayTimes, setDayTimes] = useState<Record<number, { hour: number; minute: number }>>({
    3: { hour: 19, minute: 0 },
    6: { hour: 19, minute: 0 },
  });
  const [trainerId, setTrainerId] = useState(ownerId);
  const [classType, setClassType] = useState<"1on1" | "2on1">("1on1");
  const [selectedProduct, setSelectedProduct] = useState<string | "later">("later");
  const [productFilter, setProductFilter] = useState<"all" | "1on1" | "2on1">("all");
  const [allTiers, setAllTiers] = useState(false); // 담당 기반 자동 필터 해제(예외 발급용)
  const [payMethod, setPayMethod] = useState<PaymentMethod>("card");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [discountId, setDiscountId] = useState(""); // "" = 할인 없음(무자격). 회원 속성으로 저장 + 발급 시 특별할인 상품 자동 필터.
  const [pending, setPending] = useState(false);

  // 결제 금액은 상품 가격 그대로(할인은 특별할인 상품이 담당 — 금액 차감 없음).
  function onProductChange(id: string | "later") {
    setSelectedProduct(id);
    if (id !== "later") {
      const p = products.find((p) => p.id === id);
      if (p) {
        setPayAmount(String(p.price));
        // 상품명으로 수업 형태 자동 동기화 — "나중에 발급"은 토글로 직접 지정.
        const pt = productType(p.name);
        if (pt) setClassType(pt);
      }
    } else {
      setPayAmount("");
    }
  }

  // 자격 변경 시 상품 필터가 바뀐다(자격 있으면 특별할인 상품만) — 선택 상품이 숨겨지면 해제.
  function onDiscountChange(id: string) {
    setDiscountId(id);
    resetIfHidden(trainerId, allTiers, id);
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
    // 2:1은 팀 만들기에서 시간을 정하므로 개인 정기 슬롯을 생성하지 않는다.
    const slots = is2on1
      ? []
      : Object.entries(dayTimes)
          .map(([wd, t]) => ({ weekday: Number(wd), hour: t.hour, minute: t.minute }))
          .sort((a, b) => a.weekday - b.weekday);
    const res = await createMember({
      name,
      phone,
      birth,
      gender,
      slots,
      trainerId,
      discountId: discountId || undefined, // 회원 속성 저장 + 발급 시 결제 라벨 스냅샷(서버가 라벨 합성)
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
    setDayTimes((prev) => {
      const next = { ...prev };
      if (next[i] != null) delete next[i];
      else next[i] = { hour: 19, minute: 0 };
      return next;
    });
  }

  const staffOptions = trainers.map((s) => ({ value: s.id, label: s.name }));

  const selectedProductData = products.find((p) => p.id === selectedProduct);
  // 2:1이면 정기 슬롯 입력을 숨긴다 — 팀 시간은 등록 후 회원 상세 [2:1 팀으로 묶기]에서 정한다.
  // 여기서 슬롯을 받으면 잘못된 1:1 스케줄이 생성된다. 상품명 추론이 아니라 명시 토글이 기준
  // ("나중에 발급"으로 등록하는 2:1 회원의 함정 방지, 감사 후속).
  const is2on1 = classType === "2on1";

  // 담당 + 할인 자격 자동 필터: 담당(대표/강사)에 맞는 상품 중, 자격 있으면 특별할인 상품만·없으면 특별할인 상품 숨김.
  const trainerIsOwner = trainerId === ownerId;
  const qualified = discountId !== "";
  const tierVisible = products.filter(
    (p) => allTiers || (tierMatches(p.name, trainerIsOwner) && isDiscountProduct(p.name) === qualified),
  );

  /** 담당/자격/필터 변경으로 선택 상품이 숨겨지면 선택 해제 — 조용히 엉뚱한 상품이 발급되는 것 방지. */
  function resetIfHidden(nextTrainerId: string, nextAllTiers: boolean, nextDiscountId: string) {
    if (selectedProduct === "later") return;
    const p = products.find((pp) => pp.id === selectedProduct);
    if (!p) return;
    const shown =
      nextAllTiers ||
      (tierMatches(p.name, nextTrainerId === ownerId) && isDiscountProduct(p.name) === (nextDiscountId !== ""));
    if (!shown) {
      setSelectedProduct("later");
      setPayAmount("");
    }
  }
  function onTrainerChange(v: string) {
    setTrainerId(v);
    resetIfHidden(v, allTiers, discountId);
  }
  function onToggleAllTiers() {
    const next = !allTiers;
    setAllTiers(next);
    resetIfHidden(trainerId, next, discountId);
  }

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
              onChange={onTrainerChange}
            />
          </div>

          {/* 수업 형태 — 2:1은 정기 일정을 팀 만들기에서 정하므로 여기서 명시적으로 받는다 */}
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">수업 형태</div>
            <SegmentedToggle
              options={[
                { value: "1on1", label: "1:1" },
                { value: "2on1", label: "2:1" },
              ]}
              value={classType}
              onChange={setClassType}
            />
          </div>
        </div>

        {!is2on1 ? (
        <>
        <div className="mb-2.5 mt-6">
          <Kicker>정기 수업 요일</Kicker>
        </div>
        <div className="mb-3 flex gap-1.5">
          {DAYS.map((d, i) => {
            const on = dayTimes[i] != null;
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

        {/* per-day time rows */}
        {Object.keys(dayTimes).length > 0 && (
          <div className="mb-4 flex flex-col gap-2">
            {Object.keys(dayTimes)
              .map(Number)
              .sort((a, b) => a - b)
              .map((i) => (
                <div key={i} className="flex items-center gap-2.5 rounded-[13px] border border-ink/[0.12] bg-card px-3.5 py-2.5">
                  <span className={`w-7 shrink-0 text-center text-[13px] font-bold ${i === 0 ? "text-sunday" : "text-ink"}`}>
                    {DAYS[i]}
                  </span>
                  <div className="flex flex-1 gap-2">
                    <div className="flex-1">
                      <Select
                        value={String(dayTimes[i].hour)}
                        options={HOUR_OPTIONS}
                        onChange={(v) =>
                          setDayTimes((prev) => ({ ...prev, [i]: { ...prev[i], hour: Number(v) } }))
                        }
                      />
                    </div>
                    <div className="flex-1">
                      <SegmentedToggle
                        options={MINUTE_OPTIONS}
                        value={String(dayTimes[i].minute)}
                        onChange={(v) =>
                          setDayTimes((prev) => ({ ...prev, [i]: { ...prev[i], minute: Number(v) } }))
                        }
                      />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}

        <Banner tone="neutral">선택한 요일·시간에 매주 수업이 자동 생성돼요.</Banner>
        </>
        ) : (
          <Banner tone="team" className="mt-6">
            2:1 팀 수업은 회원 등록 후 회원 상세 화면의 [2:1 팀으로 묶기]에서 두 회원을 함께 묶어 시간을 정해요.
          </Banner>
        )}

        {/* 회원권 상품 선택 — 담당(대표/강사) 기준 자동 필터 + 유형 토글 */}
        <div className="mb-2.5 mt-6 flex items-center">
          <Kicker>회원권 상품</Kicker>
          {tierVisible.length !== products.length || allTiers ? (
            <button
              type="button"
              onClick={onToggleAllTiers}
              className="tappable ml-auto text-[12px] font-semibold text-muted5 underline underline-offset-2"
            >
              {allTiers ? `${trainerIsOwner ? "대표" : "강사"} 상품만 보기` : "전체 상품 보기"}
            </button>
          ) : null}
        </div>
        {products.length > 0 ? (
          <div className="mb-2.5">
            <SegmentedToggle
              options={[
                { value: "all", label: "전체" },
                { value: "1on1", label: "1:1" },
                { value: "2on1", label: "2:1" },
              ]}
              value={productFilter}
              onChange={setProductFilter}
            />
          </div>
        ) : null}
        <div className="mb-4 flex flex-col gap-2.5">
          {tierVisible
            .filter((p) => productFilter === "all" || productType(p.name) === productFilter)
            .map((p) => (
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

        {/* 특별 할인 자격 — 회원 속성으로 저장(가족/군경소방 등). 자격 선택 시 특별할인 상품만 노출. */}
        {discounts.length > 0 ? (
          <div className="mb-4">
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">특별 할인 자격</div>
            <Select
              value={discountId}
              options={[
                { value: "", label: "할인 없음" },
                ...discounts.map((d) => ({ value: d.id, label: d.name })),
              ]}
              onChange={onDiscountChange}
            />
          </div>
        ) : null}

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
