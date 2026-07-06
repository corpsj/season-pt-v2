"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { Field, MoneyInput, TextInput } from "@/components/ui/Field";
import { PlainTextInput } from "@/components/ui/PlainTextInput";
import { Switch } from "@/components/ui/Switch";
import { SegmentedToggle } from "@/components/ui/SegmentedToggle";
import { PrimaryButton, OutlineButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
  createProduct,
  updateProduct,
  setProductActive,
  deleteProduct,
} from "@/lib/data/groups/owner-ops-actions";
import {
  productTier,
  productType,
  composeProductName,
  isDiscountProduct,
  isUnclassified,
  matchesQuad,
  QUAD_TABS,
  type ProductTier,
  type Quad,
} from "@/lib/data/product-class";
import type { MembershipProduct } from "@/lib/types";

/*
 * 상품 목록은 담당(대표/강사) × 유형(1:1/2:1) × 회차의 가격표다.
 * 담당×유형은 4탭(대표1:1/강사1:1/대표2:1/강사2:1)으로 가르고, 회차는 정렬된 2열 칩으로.
 * 탭이 담당·유형 맥락을 주니 칩은 "8회권"만 — 반복 접두사를 흡수한다.
 * 비활성 상품은 접힌 보관함으로, 편집은 칩 탭 → 바텀시트.
 */

type FormState = {
  tier: ProductTier;
  ptype: "1on1" | "2on1";
  discount: boolean; // 특별할인 상품(자체 할인 가격표) — 이름에 "특별할인" 접두
  name: string;
  nameTouched: boolean; // 사용자가 이름을 직접 수정하면 자동 조합 중단
  sessions: string;
  price: string;
  unitListPrice: string;
  unitTouched: boolean; // 사용자가 정상가를 직접 입력하면 자동 계산 중단
  durationDays: string;
};

const EMPTY_FORM: FormState = {
  tier: "owner", ptype: "1on1", discount: false, name: "",
  nameTouched: false, sessions: "", price: "", unitListPrice: "", unitTouched: false, durationDays: "90",
};

/** 판매가 ÷ 회차 (자동 정상가). */
function autoUnit(sessions: string, price: string): string {
  const s = Number(sessions);
  const pr = Number(price.replace(/[^\d]/g, ""));
  return s > 0 && pr > 0 ? String(Math.round(pr / s)) : "";
}

function productToForm(p: MembershipProduct): FormState {
  const tier = productTier(p.name);
  const ptype = productType(p.name) ?? "1on1";
  const discount = isDiscountProduct(p.name);
  // 이름이 규칙 조합과 정확히 일치하면 자동 동기화 유지, 커스텀 이름이면 보존.
  const nameTouched = p.name !== composeProductName(tier, ptype, p.sessions, discount);
  // 저장된 정상가가 자동값(판매가÷회차)과 다르면 '직접 입력'으로 보고 보존, 같으면 자동 유지.
  const auto = p.sessions > 0 ? Math.round(p.price / p.sessions) : 0;
  const unitTouched = !!p.unitListPrice && p.unitListPrice !== auto;
  return {
    tier, ptype, discount, name: p.name, nameTouched,
    sessions: String(p.sessions),
    price: String(p.price),
    unitListPrice: p.unitListPrice ? String(p.unitListPrice) : "",
    unitTouched,
    durationDays: String(p.durationDays),
  };
}

function bySessionsAsc(a: MembershipProduct, b: MembershipProduct) {
  return a.sessions - b.sessions || a.price - b.price;
}

export function ProductsClient({ products }: { products: MembershipProduct[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [productTab, setProductTab] = useState<Quad>("owner-1on1");
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [editActive, setEditActive] = useState(true); // 시트 안 판매 상태 표시용
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  // 판매중 먼저, 단종은 뒤로 — 단종 상품도 탭 안에 함께 보여 토글로 바로 켜고 끌 수 있게.
  const activeFirst = (a: MembershipProduct, b: MembershipProduct) =>
    Number(b.active) - Number(a.active) || bySessionsAsc(a, b);

  const activeTab = QUAD_TABS.find((t) => t.key === productTab)!;
  // 발급 픽커와 동일한 담당×유형 4탭. 특별할인 상품은 자기 탭에 배지로 함께 노출.
  const visible = useMemo(
    () => products.filter((p) => matchesQuad(p.name, activeTab)).sort(activeFirst),
    [products, activeTab],
  );
  // 4탭 어디에도 안 맞는 무표기(공용/무유형) 상품 — 숨김 방지용 별도 그룹(지금은 0개).
  const unclassified = useMemo(() => products.filter((p) => isUnclassified(p.name)).sort(activeFirst), [products]);

  function openNew() {
    setForm({ ...EMPTY_FORM, tier: activeTab.tier, ptype: activeTab.type, name: "" });
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
      // 정상가를 직접 만지기 전까지는 판매가·회차에서 실시간 계산해 채운다.
      if (!next.unitTouched) next.unitListPrice = autoUnit(next.sessions, next.price);
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
    toast(!editActive ? "판매를 재개했어요" : "단종 처리했어요");
    router.refresh();
  }

  /** 카드에서 바로 판매/단종 전환 — 시트를 열지 않고 토글. */
  async function toggleActive(p: MembershipProduct) {
    if (busy) return;
    setBusy(true);
    const res = await setProductActive(p.id, !p.active);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "상태 변경에 실패했어요", "error");
    toast(p.active ? "단종 처리했어요" : "판매를 재개했어요");
    router.refresh();
  }

  async function onDelete() {
    if (!editId || editId === "new" || busy) return;
    const ok = await confirm({
      title: "상품을 삭제할까요?",
      description: "발급 이력이 없는 상품만 삭제돼요. 되돌릴 수 없어요.",
      confirmLabel: "삭제",
      tone: "warn",
    });
    if (!ok) return;
    setBusy(true);
    const res = await deleteProduct(editId);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "삭제에 실패했어요", "error");
    toast("상품을 삭제했어요");
    closeForm();
    router.refresh();
  }

  const num = (field: "sessions" | "price" | "unitListPrice" | "durationDays") =>
    (e: React.ChangeEvent<HTMLInputElement>) => patchForm({ [field]: e.target.value } as Partial<FormState>);

  function chipCard(p: MembershipProduct) {
    return (
      <div
        key={p.id}
        className={`rounded-[13px] border bg-card px-3.5 py-3 ${p.active ? "border-ink/[0.1]" : "border-ink/[0.08]"}`}
      >
        <button type="button" onClick={() => openEdit(p)} className="tappable block w-full text-left">
          <div className={`flex flex-wrap items-baseline gap-1.5 ${p.active ? "" : "opacity-60"}`}>
            <span className="truncate text-[15px] font-bold text-ink">
              {productType(p.name) ? `${p.sessions}회권` : p.name}
            </span>
            {isDiscountProduct(p.name) ? (
              <span className="flex-none rounded-md bg-gold-bg px-1.5 py-0.5 text-[10.5px] font-bold text-gold">특별할인</span>
            ) : null}
          </div>
          <div className={`mt-1 text-[13px] font-semibold text-ink ${p.active ? "" : "opacity-60"}`}>₩{p.price.toLocaleString()}</div>
          <div className={`mt-0.5 text-[11.5px] font-medium text-muted ${p.active ? "" : "opacity-60"}`}>유효 {p.durationDays}일</div>
        </button>
        {/* 카드에서 바로 판매/단종 토글 */}
        <div className="mt-2.5 flex items-center justify-between border-t border-ink/[0.06] pt-2.5">
          <span className={`text-[11.5px] font-bold ${p.active ? "text-sage" : "text-muted3"}`}>
            {p.active ? "판매 중" : "단종"}
          </span>
          <Switch on={p.active} onChange={() => toggleActive(p)} disabled={busy} label={p.active ? "판매 중" : "단종"} />
        </div>
      </div>
    );
  }

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

        {/* 담당×유형 4탭 — 발급 픽커와 동일 */}
        <SegmentedToggle
          className="mb-4"
          options={QUAD_TABS.map((t) => ({ value: t.key, label: t.label }))}
          value={productTab}
          onChange={setProductTab}
        />

        {/* 회차 칩 그리드 — 판매중 먼저, 단종은 뒤에 함께(토글로 바로 전환) */}
        {visible.length === 0 ? (
          <Card className="p-6 text-center text-[13.5px] text-muted">
            {products.length > 0 ? "이 분류에 상품이 없어요. ‘추가’로 만드세요." : "등록된 상품이 없어요. ‘추가’로 시작하세요."}
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-2">{visible.map(chipCard)}</div>
        )}

        {/* 기타(미분류) — 담당/유형 표기 없는 예전 상품, 숨김 방지 */}
        {unclassified.length > 0 ? (
          <div className="mt-4">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-chip-soft px-2 py-0.5 text-[11.5px] font-bold text-muted2">기타</span>
              <span className="text-[11.5px] font-medium text-muted">{unclassified.length}개</span>
            </div>
            <div className="grid grid-cols-2 gap-2">{unclassified.map(chipCard)}</div>
          </div>
        ) : null}

        <div className="mt-4">
          <Banner tone="neutral">
            각 카드의 토글로 <b>판매/단종</b>을 바로 전환해요. 단종하면 신규 회원 발급 화면엔 안 보이지만, 이미 그 상품을 쓰던 회원은 연장할 수 있어요.
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
            className="max-h-[88dvh] w-full max-w-[420px] overflow-y-auto rounded-t-[20px] bg-card p-5 pb-[max(20px,var(--safe-b))] sm:rounded-[20px]"
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
                  ]}
                  value={form.tier === "common" ? "owner" : form.tier}
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
                  <div className="mt-0.5 text-[11px] text-muted">해당 탭에 특별할인 배지로 표시돼요</div>
                </div>
                <Switch on={form.discount} onChange={(v) => patchForm({ discount: v })} label={form.discount ? "특별할인" : "일반"} />
              </div>
              <Field icon="refresh" label="회차">
                <TextInput inputMode="numeric" placeholder="10" value={form.sessions} onChange={num("sessions")} />
              </Field>
              <Field icon="coins" label="가격" hint="원">
                <MoneyInput placeholder="750,000" value={form.price} onValueChange={(d) => patchForm({ price: d })} />
              </Field>
              <Field icon="coins" label={`1회 정상가 (환불 기준, 원)${form.unitTouched ? "" : " · 자동"}`} hint="원">
                <MoneyInput placeholder="자동 (판매가 ÷ 회차)" value={form.unitListPrice} onValueChange={(d) => patchForm({ unitListPrice: d, unitTouched: true })} />
              </Field>
              <Field icon="calendar" label="유효기간 (일)">
                <TextInput inputMode="numeric" placeholder="90" value={form.durationDays} onChange={num("durationDays")} />
              </Field>
              <Field icon="ticket-fill" label="상품명 (자동 생성)">
                <PlainTextInput
                  placeholder="대표 1:1 10회권"
                  value={form.name}
                  onChange={(v) => setForm((prev) => ({ ...prev, name: v, nameTouched: true }))}
                  className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-placeholder"
                />
              </Field>

              {editId !== "new" ? (
                <>
                  <div className="flex items-center justify-between rounded-[13px] bg-sage-banner px-4 py-3">
                    <span className="text-[13px] font-semibold text-muted2">판매 중 (끄면 단종 — 기존 회원만 연장)</span>
                    <Switch on={editActive} onChange={onToggleActive} label={editActive ? "판매" : "단종"} />
                  </div>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={busy}
                    className="tappable self-start text-[12.5px] font-semibold text-terracotta-deep disabled:opacity-50"
                  >
                    상품 삭제
                  </button>
                </>
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
