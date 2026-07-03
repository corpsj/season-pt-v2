"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Kicker } from "@/components/ui/Kicker";
import { Field, MoneyInput, TextInput } from "@/components/ui/Field";
import { Switch } from "@/components/ui/Switch";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import {
  createProduct,
  updateProduct,
  setProductActive,
} from "@/lib/data/groups/owner-ops-actions";
import {
  productTier,
  productType,
  composeProductName,
  isDiscountProduct,
  matchesPickerFilter,
  type ProductTier,
  type PickerFilter,
} from "@/lib/data/product-class";
import type { MembershipProduct } from "@/lib/types";

/*
 * 상품 목록은 담당(대표/강사/공용) × 유형(1:1/2:1) × 회차의 가격표다.
 * 담당은 토글로 반쪽만, 유형은 섹션 헤더로(반복 접두사 흡수), 회차는 정렬된 2열 칩으로.
 * 비활성 상품은 접힌 보관함으로 — 은퇴 상품이 작업 목록을 밀어내지 않는다.
 * 편집은 칩 탭 → 바텀시트(인라인 폼이 목록을 화면 밖으로 밀던 문제 해결).
 */

const TIER_LABEL: Record<ProductTier, string> = { owner: "대표", staff: "강사", common: "공용" };
const TYPE_LABEL: Record<string, string> = { "1on1": "1:1", "2on1": "2:1", etc: "기타" };

type FormState = {
  tier: ProductTier;
  ptype: "1on1" | "2on1";
  discount: boolean; // 특별할인 상품(자체 할인 가격표) — 이름에 "특별할인" 접두
  name: string;
  nameTouched: boolean; // 사용자가 이름을 직접 수정하면 자동 조합 중단
  sessions: string;
  price: string;
  unitListPrice: string;
  durationDays: string;
};

const EMPTY_FORM: FormState = {
  tier: "common", ptype: "1on1", discount: false, name: "",
  nameTouched: false, sessions: "", price: "", unitListPrice: "", durationDays: "90",
};

function productToForm(p: MembershipProduct): FormState {
  const tier = productTier(p.name);
  const ptype = productType(p.name) ?? "1on1";
  const discount = isDiscountProduct(p.name);
  // 이름이 규칙 조합과 정확히 일치하면 자동 동기화 유지, 커스텀 이름이면 보존.
  const nameTouched = p.name !== composeProductName(tier, ptype, p.sessions, discount);
  return {
    tier, ptype, discount, name: p.name, nameTouched,
    sessions: String(p.sessions),
    price: String(p.price),
    unitListPrice: p.unitListPrice ? String(p.unitListPrice) : "",
    durationDays: String(p.durationDays),
  };
}

function bySessionsAsc(a: MembershipProduct, b: MembershipProduct) {
  return a.sessions - b.sessions || a.price - b.price;
}

export function ProductsClient({ products }: { products: MembershipProduct[] }) {
  const router = useRouter();
  const toast = useToast();
  const [typeFilter, setTypeFilter] = useState<PickerFilter>("1on1");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [editActive, setEditActive] = useState(true); // 시트 안 판매 상태 표시용
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => products.filter((p) => p.active), [products]);
  const archived = useMemo(() => products.filter((p) => !p.active), [products]);

  // 발급 픽커와 동일한 1:1/2:1/특별할인 3분류(matchesPickerFilter 단일 소스) — 담당(대표/강사)은 카드 뱃지로 구분.
  const visible = useMemo(
    () => active.filter((p) => matchesPickerFilter(p.name, typeFilter)),
    [active, typeFilter],
  );

  // 유형 섹션: 1:1 → 2:1 → 기타(이름 규칙 밖), 비어있는 섹션은 생략.
  const sections = useMemo(() => {
    const g: Record<string, MembershipProduct[]> = { "1on1": [], "2on1": [], etc: [] };
    for (const p of visible) g[productType(p.name) ?? "etc"].push(p);
    return (["1on1", "2on1", "etc"] as const)
      .map((k) => ({ key: k, label: TYPE_LABEL[k], items: g[k].sort(bySessionsAsc) }))
      .filter((s) => s.items.length > 0);
  }, [visible]);

  function openNew() {
    setForm({ ...EMPTY_FORM, name: "" });
    setEditActive(true);
    setEditId("new");
  }
  function openEdit(p: MembershipProduct) {
    setForm(productToForm(p));
    setEditActive(p.active);
    setEditId(p.id);
  }
  function closeForm() {
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  /** tier/ptype/sessions 변경 시 이름 자동 조합(사용자가 이름을 직접 만지기 전까지). */
  function patchForm(patch: Partial<FormState>) {
    setForm((prev) => {
      const next = { ...prev, ...patch };
      if (!next.nameTouched) {
        const n = Number(next.sessions);
        next.name = n > 0 ? composeProductName(next.tier, next.ptype, n, next.discount) : next.name;
      }
      return next;
    });
  }

  async function onSave() {
    if (busy) return;
    const sessions = Number(form.sessions);
    const price = Number(form.price.replace(/[^\d]/g, ""));
    const unitListPrice = Number(form.unitListPrice.replace(/[^\d]/g, "") || "0");
    const durationDays = Number(form.durationDays);
    if (!form.name.trim()) return toast("상품명을 입력해주세요", "error");
    if (!sessions || sessions <= 0) return toast("회차를 입력해주세요", "error");
    if (!price || price <= 0) return toast("가격을 입력해주세요", "error");
    if (!durationDays || durationDays <= 0) return toast("유효기간을 입력해주세요", "error");

    setBusy(true);
    const input = { name: form.name.trim(), sessions, price, unitListPrice, durationDays };
    const res = editId === "new" ? await createProduct(input) : await updateProduct(editId!, input);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "저장에 실패했어요", "error");
    toast(editId === "new" ? "상품을 추가했어요" : "상품을 수정했어요");
    closeForm();
    router.refresh();
  }

  async function onToggleActive() {
    if (!editId || editId === "new" || busy) return;
    setBusy(true);
    const res = await setProductActive(editId, !editActive);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "상태 변경에 실패했어요", "error");
    setEditActive(!editActive);
    toast(!editActive ? "판매를 재개했어요" : "보관함으로 옮겼어요");
    router.refresh();
  }

  const num = (field: "sessions" | "price" | "unitListPrice" | "durationDays") =>
    (e: React.ChangeEvent<HTMLInputElement>) => patchForm({ [field]: e.target.value } as Partial<FormState>);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-5 flex items-center gap-3">
          <BackButton fallback="/t/perf" />
          <span className="flex-1 text-[19px] font-bold text-ink">회원권 상품</span>
          <PrimaryButton icon="plus-bold" iconSize={15} onClick={openNew} className="!h-10 !w-auto !rounded-xl !px-4 !text-[13.5px]">
            추가
          </PrimaryButton>
        </div>

        {/* 분류 필터 — 발급 픽커와 동일한 3칩 */}
        <SegmentedToggle
          className="mb-4"
          options={[
            { value: "1on1", label: "1:1" },
            { value: "2on1", label: "2:1" },
            { value: "discount", label: "특별할인" },
          ]}
          value={typeFilter}
          onChange={(v) => setTypeFilter(v as PickerFilter)}
        />

        {/* 판매 중 — 유형 섹션 × 회차 칩 그리드 */}
        {sections.length === 0 ? (
          <Card className="p-6 text-center text-[13.5px] text-muted">
            {active.length > 0 ? "이 분류에 상품이 없어요." : "등록된 상품이 없어요. ‘추가’로 시작하세요."}
          </Card>
        ) : (
          sections.map((sec) => (
            <div key={sec.key} className="mb-4">
              <div className="mb-2">
                <Kicker>{sec.label}</Kicker>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {sec.items.map((p) => {
                  const tier = productTier(p.name);
                  const typed = productType(p.name) !== null;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => openEdit(p)}
                      className="tappable rounded-[13px] border border-ink/[0.1] bg-card px-3.5 py-3 text-left"
                    >
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="truncate text-[15px] font-bold text-ink">
                          {typed ? `${p.sessions}회` : p.name}
                        </span>
                        {tier !== "common" ? (
                          <span className="flex-none rounded-md bg-sage-banner px-1.5 py-0.5 text-[10.5px] font-bold text-sage-deep">
                            {TIER_LABEL[tier]}
                          </span>
                        ) : null}
                        {isDiscountProduct(p.name) ? (
                          <span className="flex-none rounded-md bg-gold-bg px-1.5 py-0.5 text-[10.5px] font-bold text-gold">
                            특별할인
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-[13px] font-semibold text-ink">₩{p.price.toLocaleString()}</div>
                      <div className="mt-0.5 text-[11.5px] font-medium text-muted">
                        {typed ? `유효 ${p.durationDays}일` : `${p.sessions}회 · ${p.durationDays}일`}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}

        {/* 보관함(비활성) — 접힘 기본, 은퇴 상품이 작업 목록을 밀어내지 않게 */}
        {archived.length > 0 ? (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setArchiveOpen((v) => !v)}
              className="tappable flex w-full items-center gap-2 rounded-[13px] bg-sage-banner px-4 py-3"
            >
              <Icon name={archiveOpen ? "chevron-down" : "chevron-right"} size={15} className="flex-none text-muted3" />
              <span className="text-[13px] font-semibold text-muted2">보관된 상품 {archived.length}개</span>
            </button>
            {archiveOpen ? (
              <Card className="mt-2 overflow-hidden">
                {archived.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openEdit(p)}
                    className={`tappable flex w-full items-center gap-3 px-4 py-3 text-left opacity-60 ${i > 0 ? "border-t border-ink/[0.07]" : ""}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-bold text-ink">{p.name}</div>
                      <div className="mt-0.5 text-[11.5px] text-muted">
                        {p.sessions}회 · ₩{p.price.toLocaleString()} · {p.durationDays}일
                      </div>
                    </div>
                    <Icon name="pencil" size={15} className="flex-none text-muted" />
                  </button>
                ))}
              </Card>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4">
          <Banner tone="neutral">
            상품명의 대표/강사·1:1/2:1 표기로 발급 화면이 자동 분류돼요. 보관(비활성) 상품은 발급 화면에 표시되지 않아요.
          </Banner>
        </div>
        <div className="h-3.5" />
      </Body>

      {/* 추가/수정 바텀시트 — 이름은 토글 조합으로 자동 생성(직접 수정 가능) */}
      {editId ? (
        <div
          onClick={closeForm}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-[rgba(38,35,30,0.42)] sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[20px] bg-card p-5 sm:rounded-[20px]"
          >
            <div className="mb-4 text-[16px] font-bold text-ink">
              {editId === "new" ? "상품 추가" : "상품 수정"}
            </div>
            <div className="flex flex-col gap-3">
              <div>
                <div className="mb-2 text-[12.5px] font-semibold text-muted5">담당</div>
                <SegmentedToggle
                  options={[
                    { value: "owner", label: "대표" },
                    { value: "staff", label: "강사" },
                    { value: "common", label: "공용" },
                  ]}
                  value={form.tier}
                  onChange={(v) => patchForm({ tier: v as ProductTier })}
                />
              </div>
              <div>
                <div className="mb-2 text-[12.5px] font-semibold text-muted5">유형</div>
                <SegmentedToggle
                  options={[
                    { value: "1on1", label: "1:1" },
                    { value: "2on1", label: "2:1" },
                  ]}
                  value={form.ptype}
                  onChange={(v) => patchForm({ ptype: v as "1on1" | "2on1" })}
                />
              </div>
              <div className="flex items-center justify-between rounded-[13px] bg-gold-bg px-4 py-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-ink">특별할인 상품</div>
                  <div className="mt-0.5 text-[11px] text-muted">발급 화면의 특별할인 탭에 표시돼요</div>
                </div>
                <Switch on={form.discount} onChange={(v) => patchForm({ discount: v })} label={form.discount ? "특별할인" : "일반"} />
              </div>
              <Field icon="refresh" label="회차">
                <TextInput inputMode="numeric" placeholder="10" value={form.sessions} onChange={num("sessions")} />
              </Field>
              <Field icon="coins" label="가격" hint="원">
                <MoneyInput placeholder="750,000" value={form.price} onValueChange={(d) => patchForm({ price: d })} />
              </Field>
              <Field icon="coins" label="1회 정상가 (환불 기준)" hint="원">
                <MoneyInput placeholder="100,000" value={form.unitListPrice} onValueChange={(d) => patchForm({ unitListPrice: d })} />
              </Field>
              <Field icon="calendar" label="유효기간 (일)">
                <TextInput inputMode="numeric" placeholder="90" value={form.durationDays} onChange={num("durationDays")} />
              </Field>
              <Field icon="ticket-fill" label="상품명 (자동 생성)">
                <TextInput
                  placeholder="1:1 PT 10회권"
                  value={form.name}
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value, nameTouched: true }))}
                />
              </Field>

              {editId !== "new" ? (
                <div className="flex items-center justify-between rounded-[13px] bg-sage-banner px-4 py-3">
                  <span className="text-[13px] font-semibold text-muted2">판매 중 (끄면 보관함으로)</span>
                  <Switch on={editActive} onChange={onToggleActive} label={editActive ? "판매" : "보관"} />
                </div>
              ) : null}
            </div>
            <div className="mt-4 flex gap-2.5">
              <OutlineButton onClick={closeForm} className="flex-1">취소</OutlineButton>
              <PrimaryButton onClick={onSave} pending={busy} className="flex-[1.6]">저장</PrimaryButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

