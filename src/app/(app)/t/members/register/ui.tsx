"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Body, Footer } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Field, MoneyInput, PhoneInput, TextInput } from "@/components/ui/Field";
import { Kicker } from "@/components/ui/Kicker";
import { Banner } from "@/components/ui/Banner";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { Select } from "@/components/ui/Select";
import { RadioOption } from "@/components/ui/RadioOption";
import { Card } from "@/components/ui/Card";
import { PrimaryButton } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { createMember, createDuetMembers } from "@/lib/data/groups/owner-ops-actions";
import { productType, matchesPickerFilter, type PickerFilter } from "@/lib/data/product-class";
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
  // 듀엣(2:1) 파트너 — 신규 회원 2명 동시 등록
  const [p2, setP2] = useState({ name: "", phone: "", birth: "", gender: "female" as Gender });
  // 정기 일정은 선택 사항 — 요일을 고르지 않으면 일정 없이 등록된다.
  const [dayTimes, setDayTimes] = useState<Record<number, { hour: number; minute: number }>>({});
  const [trainerId, setTrainerId] = useState(ownerId);
  const [classType, setClassType] = useState<"1on1" | "2on1">("1on1");
  const [selectedProduct, setSelectedProduct] = useState<string | "later">("later");
  const [productFilter, setProductFilter] = useState<PickerFilter>("1on1");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("card");
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(todayStr());
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

  async function onSubmit() {
    if (pending) return;
    if (is2on1 && (!p2.name.trim() || !p2.phone.trim() || !p2.birth.trim())) {
      toast("듀엣 파트너의 이름·연락처·생년월일을 입력해주세요", "error");
      return;
    }
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

  const selectedProductData = products.find((p) => p.id === selectedProduct);
  // 2:1이면 정기 슬롯 입력을 숨긴다 — 팀 시간은 등록 후 회원 상세 [2:1 팀으로 묶기]에서 정한다.
  // 여기서 슬롯을 받으면 잘못된 1:1 스케줄이 생성된다. 상품명 추론이 아니라 명시 토글이 기준
  // ("나중에 발급"으로 등록하는 2:1 회원의 함정 방지, 감사 후속).
  const is2on1 = classType === "2on1";

  /** 상품 필터 변경. 1:1/2:1은 등록 형태(듀엣)와 직결 — 함께 전환해 파트너 입력이 열리게 한다(특별할인은 형태 무관).
   *  칩 변경으로 선택 상품이 숨겨지면 선택 해제 — 조용히 엉뚱한 상품이 발급되는 것 방지. */
  function onFilterChange(next: PickerFilter) {
    setProductFilter(next);
    if (next === "1on1" || next === "2on1") setClassType(next);
    if (selectedProduct === "later") return;
    const p = products.find((pp) => pp.id === selectedProduct);
    if (p && !matchesPickerFilter(p.name, next)) {
      setSelectedProduct("later");
      setPayAmount("");
    }
  }

  /** 수업 형태 토글. 상품 필터도 맞춰(듀엣이면 2:1 상품이 보이게) 안 맞는 선택 상품은 해제한다. */
  function onClassTypeChange(next: "1on1" | "2on1") {
    onFilterChange(next);
  }

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/perf" />
          <span className="text-[19px] font-bold text-ink">회원 등록</span>
        </div>

        <div className="flex flex-col gap-3.5">
          <Field icon="person" label="이름">
            <TextInput placeholder="윤서아" value={name} onChange={(e) => setName(e.target.value)} />
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

          {/* 담당 강사 */}
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">담당 강사</div>
            <Select
              value={trainerId}
              options={staffOptions}
              onChange={setTrainerId}
            />
          </div>

          {/* 수업 형태 — 2:1(듀엣)은 파트너 정보를 함께 받아 두 명을 동시에 등록한다 */}
          <div>
            <div className="mb-2 text-[12.5px] font-semibold text-muted5">수업 형태</div>
            <SegmentedToggle
              options={[
                { value: "1on1", label: "1:1" },
                { value: "2on1", label: "2:1 (듀엣)" },
              ]}
              value={classType}
              onChange={onClassTypeChange}
            />
          </div>
        </div>

        {/* 듀엣 파트너 — 신규 회원 2명 동시 등록 */}
        {is2on1 ? (
          <>
            <div className="mb-2.5 mt-6">
              <Kicker>듀엣 파트너</Kicker>
            </div>
            <Card className="flex flex-col gap-3.5 p-4">
              <Field icon="person" label="이름">
                <TextInput placeholder="이은비" value={p2.name} onChange={(e) => setP2({ ...p2, name: e.target.value })} />
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

        <div className="mb-2.5 mt-6">
          <Kicker>{is2on1 ? "팀 정기 수업 요일 (선택)" : "정기 수업 요일 (선택)"}</Kicker>
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

        <Banner tone="neutral">
          {is2on1
            ? "선택한 요일·시간에 두 회원의 팀 수업이 매주 자동 생성돼요. 일정은 나중에 정해도 돼요."
            : "선택한 요일·시간에 매주 수업이 자동 생성돼요. 일정은 나중에 정해도 돼요."}
        </Banner>

        {/* 회원권 상품 선택 — 1:1/2:1/특별할인 3분류 칩 */}
        <div className="mb-2.5 mt-6">
          <Kicker>회원권 상품</Kicker>
        </div>
        {is2on1 ? (
          <div className="mb-2.5 text-[12px] font-medium text-muted">선택한 회원권은 두 회원에게 각각 발급·결제 기록돼요.</div>
        ) : null}
        {products.length > 0 ? (
          <div className="mb-2.5">
            <SegmentedToggle
              options={[
                { value: "1on1", label: "1:1" },
                { value: "2on1", label: "2:1" },
                { value: "discount", label: "특별할인" },
              ]}
              value={productFilter}
              onChange={onFilterChange}
            />
          </div>
        ) : null}
        <div className="mb-4 flex flex-col gap-2.5">
          {products
            .filter((p) => matchesPickerFilter(p.name, productFilter))
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
            <Field icon="coins" label={is2on1 ? "금액 (1인당)" : "금액"} hint="원">
              <MoneyInput
                placeholder={selectedProductData.price.toLocaleString("ko-KR")}
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
