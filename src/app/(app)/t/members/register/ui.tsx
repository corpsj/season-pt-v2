"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, MoneyInput, PhoneInput, TextInput } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Select } from "@/components/ui/Select";
import { RadioOption } from "@/components/ui/RadioOption";
import { Card } from "@/components/ui/Card";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createMember, createDuetMembers } from "@/lib/data/groups/owner-ops-actions";
import {
  QUAD_TABS,
  matchesQuad,
  isUnclassified,
  isDuetProduct,
  isDiscountProduct,
  productShortLabel,
  productTier,
  type Quad,
} from "@/lib/data/product-class";
import type { Gender, PaymentMethod, MembershipProduct } from "@/lib/types";

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

/** 등록 플로우의 번호 섹션 헤더 — ①회원권 ②회원 정보 ③담당·결제 ④정기 요일. */
function SectionHead({ no, title, hint }: { no: number; title: string; hint?: string }) {
  return (
    <div className={`mb-3 flex items-baseline gap-2 ${no === 1 ? "" : "mt-7 border-t border-ink/[0.08] pt-6"}`}>
      <span className="flex h-[21px] w-[21px] flex-none translate-y-[3px] items-center justify-center rounded-full bg-sage text-[11.5px] font-bold text-surface">{no}</span>
      <span className="text-[15px] font-bold text-ink">{title}</span>
      {hint ? <span className="text-[12px] font-medium text-muted5">{hint}</span> : null}
    </div>
  );
}

export function MemberRegisterClient({
  ownerId,
  products,
  trainers,
}: {
  ownerId: string;
  products: MembershipProduct[];
  trainers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [birth, setBirth] = useState("");
  const [gender, setGender] = useState<Gender>("female");
  // 듀엣(2:1) 파트너 — 2:1 회원권을 고르면 신규 회원 2명 동시 등록
  const [p2, setP2] = useState({ name: "", phone: "", birth: "", gender: "female" as Gender });
  // 정기 일정은 선택 사항 — 요일을 고르지 않으면 일정 없이 등록된다.
  const [dayTimes, setDayTimes] = useState<Record<number, { hour: number; minute: number }>>({});
  const [trainerId, setTrainerId] = useState(ownerId);
  const [productTab, setProductTab] = useState<Quad>("owner-1on1");
  const [selectedProduct, setSelectedProduct] = useState<string | "later">("later");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("card");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
  const [pending, setPending] = useState(false);

  const selectedProductData = products.find((p) => p.id === selectedProduct);
  // 수업 형태는 더 이상 별도 토글이 아니다 — 선택한 회원권이 2:1이면 듀엣(2명 동시 등록).
  // "나중에 발급"(상품 미선택)은 항상 1명 등록, 팀은 이후 회원 상세 [2:1 팀으로 묶기]에서 묶는다.
  const is2on1 = selectedProductData ? isDuetProduct(selectedProductData.name) : false;

  const activeTab = QUAD_TABS.find((t) => t.key === productTab)!;
  const visibleProducts = products.filter((p) => matchesQuad(p.name, activeTab) || isUnclassified(p.name));

  // 결제 금액은 상품 가격 그대로. 2:1은 두 회원 합계로 보여준다(상품가 × 2).
  // 담당 강사 기본값도 상품 담당(대표/강사)에 맞춘다 — 강제 아님, 이후 자유 변경.
  function onProductChange(id: string | "later") {
    setSelectedProduct(id);
    const p = id !== "later" ? products.find((pp) => pp.id === id) : undefined;
    setPayAmount(p ? String(isDuetProduct(p.name) ? p.price * 2 : p.price) : "");
    if (p) {
      const tier = productTier(p.name);
      if (tier === "owner" && trainerId !== ownerId) setTrainerId(ownerId);
      else if (tier === "staff" && trainerId === ownerId) {
        const staff = trainers.find((t) => t.id !== ownerId);
        if (staff) setTrainerId(staff.id);
      }
    }
  }

  /** 탭 변경 — 선택 상품이 새 탭에 안 보이면 선택 해제(조용히 엉뚱한 상품이 발급되는 것 방지). */
  function onTabChange(next: Quad) {
    setProductTab(next);
    if (selectedProduct === "later") return;
    const p = products.find((pp) => pp.id === selectedProduct);
    const tab = QUAD_TABS.find((t) => t.key === next)!;
    if (p && !matchesQuad(p.name, tab) && !isUnclassified(p.name)) {
      setSelectedProduct("later");
      setPayAmount("");
    }
  }

  async function onSubmit() {
    if (pending) return;
    if (is2on1 && (!p2.name.trim() || !p2.phone.trim() || !p2.birth.trim())) {
      toast("듀엣 파트너의 이름·연락처·생년월일을 입력해주세요", "error");
      return;
    }
    setPending(true);
    const productArg =
      selectedProduct !== "later" ? { productId: selectedProduct } : undefined;
    // 입력값은 합계(2:1이면 두 회원 합). 회원당 결제 1건이라 듀엣은 절반씩 나눠 기록한다.
    const total = payAmount ? Number(payAmount.replace(/[^\d]/g, "")) : undefined;
    const perMember = is2on1 && total ? Math.round(total / 2) : total;
    const paymentArg =
      selectedProduct !== "later"
        ? {
            method: payMethod,
            amount: perMember,
            paidAt: payDate || undefined,
          }
        : undefined;
    const slots = Object.entries(dayTimes)
      .map(([wd, t]) => ({ weekday: Number(wd), hour: t.hour, minute: t.minute }))
      .sort((a, b) => a.weekday - b.weekday);
    const res = is2on1
      ? await createDuetMembers({
          members: [
            { name, phone, birth, gender },
            { name: p2.name, phone: p2.phone, birth: p2.birth, gender: p2.gender },
          ],
          trainerId,
          slots,
          product: productArg,
          payment: paymentArg,
        })
      : await createMember({
          name,
          phone,
          birth,
          gender,
          slots,
          trainerId,
          product: productArg,
          payment: paymentArg,
        });
    if (!res.ok) {
      setPending(false);
      toast(res.error ?? "회원 등록에 실패했어요", "error");
      return;
    }
    toast(res.warn ?? (is2on1 ? "듀엣 회원 두 명을 등록했어요" : "회원을 등록했어요"));
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

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/perf" />
          <span className="text-[19px] font-bold text-ink">회원 등록</span>
        </div>

        {/* ① 회원권 — 담당×유형 4탭. 2:1 상품을 고르면 듀엣(파트너 입력)이 열린다. */}
        <SectionHead no={1} title="회원권" hint="나중에 발급해도 돼요" />
        {products.length > 0 ? (
          <div className="mb-2.5">
            <SegmentedToggle
              options={QUAD_TABS.map((t) => ({ value: t.key, label: t.label }))}
              value={productTab}
              onChange={onTabChange}
            />
          </div>
        ) : null}
        <div className="mb-4 flex flex-col gap-2.5">
          {visibleProducts.map((p) => (
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
              <span className="flex items-center gap-2">
                <span className="text-[14px] font-bold text-ink">{productShortLabel(p)}</span>
                {isDiscountProduct(p.name) ? (
                  <span className="flex-none rounded-md bg-gold-bg px-1.5 py-0.5 text-[10.5px] font-bold text-gold">특별할인</span>
                ) : null}
              </span>
            </RadioOption>
          ))}
          <RadioOption
            selected={selectedProduct === "later"}
            onClick={() => onProductChange("later")}
          >
            <span className="text-[14px] font-semibold text-muted">나중에 발급</span>
          </RadioOption>
        </div>

        {/* ② 회원 정보 */}
        <SectionHead no={2} title="회원 정보" hint={is2on1 ? "2:1 — 두 명이 함께 등록돼요" : undefined} />
        {is2on1 ? <div className="mb-2.5 text-[13px] font-bold text-gold">회원 1</div> : null}
        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="이름">
            <TextInput placeholder="이름" value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field icon="phone" label="연락처 (아이디)">
            <PhoneInput placeholder="010-0000-0000" value={phone} onValueChange={setPhone} />
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
        </div>

        {/* 듀엣 파트너 — 2:1 회원권 선택 시 함께 등록되는 두 번째 회원 */}
        {is2on1 ? (
          <>
            <div className="mb-2.5 mt-5 text-[13px] font-bold text-gold">회원 2 · 듀엣 파트너</div>
            <Card className="flex flex-col gap-3.5 p-4">
              <Field icon="person" label="이름">
                <TextInput placeholder="이름" value={p2.name} onChange={(e) => setP2({ ...p2, name: e.target.value })} />
              </Field>
              <Field icon="phone" label="연락처 (아이디)">
                <PhoneInput placeholder="010-0000-0000" value={p2.phone} onValueChange={(d) => setP2({ ...p2, phone: d })} />
              </Field>
              <Field icon="lock" label="생년월일 (초기 비밀번호)" hint="YYMMDD">
                <TextInput
                  inputMode="numeric"
                  placeholder="000000"
                  value={p2.birth}
                  onChange={(e) => setP2({ ...p2, birth: e.target.value })}
                />
              </Field>
              <div>
                <div className="mb-2 text-[12.5px] font-semibold text-muted5">성별</div>
                <SegmentedToggle
                  options={[
                    { value: "female", label: "여성" },
                    { value: "male", label: "남성" },
                  ]}
                  value={p2.gender}
                  onChange={(v) => setP2({ ...p2, gender: v })}
                />
              </div>
            </Card>
          </>
        ) : null}

        {/* ③ 담당 · 결제 — 담당 기본값은 상품 담당(대표/강사)과 연동, 결제란은 상품 선택 시에만 */}
        <SectionHead
          no={3}
          title={selectedProduct !== "later" ? "담당 · 결제" : "담당 강사"}
          hint={selectedProduct !== "later" && is2on1 ? "두 회원 합계 금액" : undefined}
        />
        <div>
          <div className="mb-2 text-[12.5px] font-semibold text-muted5">담당 강사</div>
          <Select
            value={trainerId}
            options={staffOptions}
            onChange={setTrainerId}
          />
        </div>

        {/* 결제 정보 (상품 선택 시) — 2:1은 두 회원 합계 금액 */}
        {selectedProduct !== "later" && selectedProductData && (
          <Card className="mt-3.5 flex flex-col gap-3 p-4">
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
            <Field icon="coins" label="결제 금액" hint="원">
              <MoneyInput
                placeholder={(is2on1 ? selectedProductData.price * 2 : selectedProductData.price).toLocaleString("ko-KR")}
                value={payAmount}
                onValueChange={setPayAmount}
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

        {/* ④ 정기 수업 요일 (선택) */}
        <SectionHead no={4} title={is2on1 ? "팀 정기 수업 요일" : "정기 수업 요일"} hint="선택" />
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

        <Banner tone="neutral">
          {is2on1
            ? "선택한 요일·시간에 두 회원의 팀 수업이 매주 자동 생성돼요. 일정은 나중에 정해도 돼요."
            : "선택한 요일·시간에 매주 수업이 자동 생성돼요. 일정은 나중에 정해도 돼요."}
        </Banner>

        <div className="h-3.5" />
      </Body>

      <Footer>
        <PrimaryButton icon="person-plus" pending={pending} onClick={onSubmit}>
          회원 등록
        </PrimaryButton>
      </Footer>
    </div>
  );
}
