"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, OBtn, ConsoleModal, won } from "@/components/console/ui";
import { PrivacyToggle } from "@/components/console/privacy";
import { createProduct, updateProduct, setProductActive, createDiscount, updateDiscount, setDiscountActive, updatePolicy, updateNotifications } from "@/lib/data/groups/owner-ops-actions";
import { productTier, productType, composeProductName, isDiscountProduct, type ProductTier } from "@/lib/data/product-class";
import type { MembershipProduct, DiscountItem, StudioSettings } from "@/lib/types";

export function SettingsClient({ products, discounts, settings }: { products: MembershipProduct[]; discounts: DiscountItem[]; settings: StudioSettings }) {
  const toast = useToast();

  const [noshow, setNoshow] = useState(settings.noshowDeducts);
  const [cutoff, setCutoff] = useState(settings.cancelCutoffHours);
  const [nExpiry, setNExpiry] = useState(settings.notifExpiry);
  const [nSession, setNSession] = useState(settings.notifSession);
  const [nPayment, setNPayment] = useState(settings.notifPayment);

  async function savePolicy(next: { noshowDeducts: boolean; cancelCutoffHours: number }) {
    const r = await updatePolicy(next);
    if (!r.ok) toast(r.error ?? "저장에 실패했어요", "error");
  }
  async function saveNotif(next: { notifExpiry: boolean; notifSession: boolean; notifPayment: boolean }) {
    const r = await updateNotifications(next);
    if (!r.ok) toast(r.error ?? "저장에 실패했어요", "error");
  }

  return (
    <>
      <ProductsEditor products={products} />
      <DiscountsEditor discounts={discounts} />

      <div className="grid grid-cols-2 gap-[18px]">
        {/* policy */}
        <Card className="px-6 py-[22px]">
          <div className="text-[16px] font-bold text-ink">노쇼 · 취소 정책</div>
          <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">차감 규칙과 취소 가능 시간</div>
          <div className="flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
            <Icon name="triangle-exclamation" size={18} className="text-terracotta" />
            <div className="flex-1"><div className="text-[13px] font-semibold text-ink">노쇼 시 1회 차감</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">미출석 회원 잔여 횟수 차감</div></div>
            <Switch on={noshow} onChange={(v) => { setNoshow(v); savePolicy({ noshowDeducts: v, cancelCutoffHours: cutoff }); }} />
          </div>
          <div className="mt-2.5 flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
            <Icon name="clock" size={18} className="text-sage-deep" />
            <div className="flex-1"><div className="text-[13px] font-semibold text-ink">취소 가능 시간</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">수업 시작 전 이 시간 이내 취소는 차감</div></div>
            <div className="flex items-center gap-1.5">
              <button onClick={() => { const v = Math.max(0, cutoff - 1); setCutoff(v); savePolicy({ noshowDeducts: noshow, cancelCutoffHours: v }); }} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"><Icon name="chevron-left" size={14} /></button>
              <span className="w-[52px] text-center text-[13.5px] font-bold text-ink">{cutoff}시간</span>
              <button onClick={() => { const v = Math.min(48, cutoff + 1); setCutoff(v); savePolicy({ noshowDeducts: noshow, cancelCutoffHours: v }); }} className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-[rgba(75,59,46,0.12)] bg-white text-[#766D60]"><Icon name="chevron-right" size={14} /></button>
            </div>
          </div>
        </Card>

        {/* notifications */}
        <Card className="px-6 py-[22px]">
          <div className="text-[16px] font-bold text-ink">알림 설정</div>
          <div className="mb-3 mt-1 text-[12px] font-medium text-[#9A917F]">자동 발송 알림</div>
          {[
            { label: "만료 임박 안내", desc: "유효기간 임박 시 회원에게", on: nExpiry, set: setNExpiry, key: "notifExpiry" as const },
            { label: "수업 리마인더", desc: "예정 수업 알림", on: nSession, set: setNSession, key: "notifSession" as const },
            { label: "결제 완료 안내", desc: "결제·발급 시 알림", on: nPayment, set: setNPayment, key: "notifPayment" as const },
          ].map((n) => (
            <div key={n.key} className="flex items-center gap-3 px-1 py-3">
              <div className="flex-1"><div className="text-[13px] font-semibold text-ink">{n.label}</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">{n.desc}</div></div>
              <Switch on={n.on} onChange={(v) => { n.set(v); saveNotif({ notifExpiry: n.key === "notifExpiry" ? v : nExpiry, notifSession: n.key === "notifSession" ? v : nSession, notifPayment: n.key === "notifPayment" ? v : nPayment }); }} />
            </div>
          ))}
        </Card>
      </div>

      {/* privacy */}
      <Card className="mt-[18px] px-6 py-[22px]">
        <div className="text-[16px] font-bold text-ink">화면 · 보안</div>
        <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">매장에서 화면을 띄워둘 때 유용해요</div>
        <div className="flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
          <Icon name="lock-fill" size={18} className="text-sage-deep" />
          <div className="flex-1"><div className="text-[13px] font-semibold text-ink">매출 가리기</div><div className="mt-px text-[11px] font-medium text-[#9A917F]">금액을 흐리게 표시해 어깨너머 노출을 막아요</div></div>
          <PrivacyToggle />
        </div>
      </Card>
    </>
  );
}

/* ============================================================
   회원권 상품 편집기(콘솔) — 모바일 설정 화면과 동일한 감각.
   담당(대표/강사/공용) 필터 → 유형(1:1/2:1/기타) 섹션 × 회차 칩 그리드,
   비활성은 접힌 보관함, 편집은 칩 탭 → 모달(상품명 자동 조합).
   ============================================================ */

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

const digits = (s: string) => s.replace(/[^\d]/g, "");

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

// 콘솔 필(필터·담당·유형 공용) — members ui의 상품 필터 버튼과 동일한 축.
const pillCls = (on: boolean) =>
  `rounded-[9px] px-3 py-[6px] text-[12px] font-semibold transition ${on ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"}`;
// 콘솔 입력칸 — members 모달 인풋과 동일.
const INPUT =
  "w-full rounded-[12px] border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] px-[15px] py-[12px] text-[14px] font-medium text-ink outline-none transition focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]";
const FLABEL = "mb-1.5 text-[12px] font-semibold text-[#9A917F]";

function ProductsEditor({ products }: { products: MembershipProduct[] }) {
  const router = useRouter();
  const toast = useToast();
  const [tierFilter, setTierFilter] = useState<"all" | ProductTier>("all");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [editActive, setEditActive] = useState(true); // 모달 안 판매 상태 표시용
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => products.filter((p) => p.active), [products]);
  const archived = useMemo(() => products.filter((p) => !p.active), [products]);

  // 존재하는 담당 티어만 필터로 노출(전부 공용이면 필터 행 자체가 안 보임).
  const presentTiers = useMemo(() => {
    const s = new Set(active.map((p) => productTier(p.name)));
    return (["owner", "staff", "common"] as ProductTier[]).filter((t) => s.has(t));
  }, [active]);
  const showTierFilter = presentTiers.length > 1;
  // 필터 중인 티어의 마지막 상품이 보관되면 그 티어가 presentTiers에서 사라진다 — 무효 필터는 "전체"로 간주.
  const effTier = tierFilter === "all" || presentTiers.includes(tierFilter) ? tierFilter : "all";

  const visible = useMemo(
    () => (effTier === "all" ? active : active.filter((p) => productTier(p.name) === effTier)),
    [active, effTier],
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
    setForm(EMPTY_FORM);
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

  /** 저장(cont=true면 추가 모드에서 모달을 닫지 않고 연속 입력을 이어간다). */
  async function save(cont: boolean) {
    if (busy) return;
    const sessions = Number(form.sessions);
    const price = Number(digits(form.price));
    const unitListPrice = Number(digits(form.unitListPrice) || "0");
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
    router.refresh();
    if (cont && editId === "new") {
      // 연속 입력: 담당·유형·기간은 유지하고 회차·가격·정상가만 비운다.
      setForm((f) => ({ ...f, name: "", nameTouched: false, sessions: "", price: "", unitListPrice: "" }));
      return;
    }
    closeForm();
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

  const setNum = (field: "sessions" | "price" | "unitListPrice" | "durationDays") =>
    (e: React.ChangeEvent<HTMLInputElement>) => patchForm({ [field]: digits(e.target.value) } as Partial<FormState>);

  // 모달 안 회당 단가 힌트 — 정상가 우선, 없으면 판매가/회차.
  const fSessions = Number(form.sessions);
  const fPrice = Number(digits(form.price));
  const fUnit = Number(digits(form.unitListPrice)) || (fSessions > 0 ? Math.round(fPrice / fSessions) : 0);

  return (
    <Card className="mb-[18px] px-6 py-[22px]">
      {/* header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[16px] font-bold text-ink">회원권 상품</div>
          <div className="mt-0.5 text-[12px] font-medium text-[#9A917F]">발급 화면에 노출되는 회원권이에요</div>
        </div>
        <PBtn icon="plus-bold" onClick={openNew}>상품 추가</PBtn>
      </div>

      {/* 담당 필터 — 대표/강사 상품이 함께 있을 때만 */}
      {showTierFilter ? (
        <div className="mb-4 flex items-center gap-[6px]">
          <button type="button" onClick={() => setTierFilter("all")} className={pillCls(effTier === "all")}>전체</button>
          {presentTiers.map((t) => (
            <button key={t} type="button" onClick={() => setTierFilter(t)} className={pillCls(effTier === t)}>{TIER_LABEL[t]}</button>
          ))}
        </div>
      ) : null}

      {/* 판매 중 — 유형 섹션 × 회차 칩 그리드 */}
      {sections.length === 0 ? (
        <div className="rounded-[13px] bg-[#FBF7F1] py-8 text-center text-[13px] font-medium text-[#A89F92]">
          등록된 상품이 없어요 — &lsquo;상품 추가&rsquo;로 시작하세요
        </div>
      ) : (
        sections.map((sec) => (
          <div key={sec.key} className="mb-4 last:mb-0">
            <div className="mb-2 text-[11.5px] font-bold tracking-[0.02em] text-[#8A6F3E]">{sec.label}</div>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
              {sec.items.map((p) => {
                const tier = productTier(p.name);
                const typed = productType(p.name) !== null;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openEdit(p)}
                    className="rounded-[13px] border border-ink/[0.08] bg-[#FBF9F5] px-3.5 py-3 text-left transition hover:bg-[#F7F3EB]"
                  >
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span className="min-w-0 truncate text-[15px] font-bold text-ink">
                        {typed ? `${p.sessions}회` : p.name}
                      </span>
                      {effTier === "all" && tier !== "common" ? (
                        <span className="flex-none rounded-[6px] bg-[#EDF4E3] px-1.5 py-0.5 text-[10.5px] font-bold text-[#5B6452]">
                          {TIER_LABEL[tier]}
                        </span>
                      ) : null}
                      {isDiscountProduct(p.name) ? (
                        <span className="flex-none rounded-[6px] bg-[#F4EEE3] px-1.5 py-0.5 text-[10.5px] font-bold text-[#8A6F3E]">
                          특별할인
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 text-[13px] font-semibold text-ink">{won(p.price)}</div>
                    <div className="mt-0.5 text-[11.5px] font-medium text-[#9A917F]">
                      {typed ? `유효 ${p.durationDays}일` : `${p.sessions}회 · ${p.durationDays}일`}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))
      )}

      {/* 보관함(비활성) — 접힘 기본. 은퇴 상품이 작업 목록을 밀어내지 않게. */}
      {archived.length > 0 ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 rounded-[10px] bg-[#F8F4EC] px-3 py-2.5 text-left transition hover:bg-[#F4EFE6]"
          >
            <Icon name={archiveOpen ? "chevron-down" : "chevron-right"} size={13} className="flex-none text-[#A89F92]" />
            <span className="text-[12px] font-semibold text-[#766D60]">보관된 상품 {archived.length}개 · 발급 화면에 표시되지 않아요</span>
          </button>
          {archiveOpen ? (
            <div className="mt-2 flex flex-col gap-1.5">
              {[...archived].sort(bySessionsAsc).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => openEdit(p)}
                  className="flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-left opacity-60 transition hover:bg-[#F7F3EB] hover:opacity-100"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] font-bold text-ink">{p.name}</div>
                    <div className="mt-0.5 text-[11px] font-medium text-[#9A917F]">{p.sessions}회 · {won(p.price)} · {p.durationDays}일</div>
                  </div>
                  <Icon name="pencil" size={14} className="flex-none text-[#A89F92]" />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* 추가/수정 모달 — 담당·유형·회차로 상품명 자동 조합(직접 수정 가능) */}
      {editId ? (
        <ConsoleModal
          title={editId === "new" ? "상품 추가" : "상품 수정"}
          onClose={closeForm}
          footer={
            editId === "new" ? (
              <>
                <OBtn className="flex-1" onClick={closeForm}>취소</OBtn>
                <OBtn className="flex-1" pending={busy} onClick={() => save(true)}>저장 후 계속</OBtn>
                <PBtn icon="check-bold" className="flex-1" pending={busy} onClick={() => save(false)}>저장</PBtn>
              </>
            ) : (
              <>
                <OBtn className="flex-1" onClick={closeForm}>취소</OBtn>
                <PBtn icon="check-bold" className="flex-[1.6]" pending={busy} onClick={() => save(false)}>저장</PBtn>
              </>
            )
          }
        >
          <div className="flex flex-col gap-4">
            <div>
              <div className={FLABEL}>담당</div>
              <div className="flex items-center gap-[6px]">
                {(["owner", "staff", "common"] as ProductTier[]).map((t) => (
                  <button key={t} type="button" onClick={() => patchForm({ tier: t })} className={pillCls(form.tier === t)}>{TIER_LABEL[t]}</button>
                ))}
              </div>
            </div>
            <div>
              <div className={FLABEL}>유형</div>
              <div className="flex items-center gap-[6px]">
                {(["1on1", "2on1"] as const).map((tp) => (
                  <button key={tp} type="button" onClick={() => patchForm({ ptype: tp })} className={pillCls(form.ptype === tp)}>{TYPE_LABEL[tp]}</button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-[13px] bg-[#F4EEE3] px-4 py-3">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-ink">특별할인 상품</div>
                <div className="mt-px text-[11px] font-medium text-[#9A917F]">자격 있는 회원에게만 발급 화면에 표시돼요</div>
              </div>
              <Switch on={form.discount} onChange={(v) => patchForm({ discount: v })} label={form.discount ? "특별할인" : "일반"} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className={FLABEL}>회차</div>
                <input value={form.sessions} onChange={setNum("sessions")} inputMode="numeric" placeholder="10" className={INPUT} />
              </div>
              <div>
                <div className={FLABEL}>유효기간 (일)</div>
                <input value={form.durationDays} onChange={setNum("durationDays")} inputMode="numeric" placeholder="90" className={INPUT} />
              </div>
            </div>

            <div>
              <div className={FLABEL}>가격 (원)</div>
              <input value={form.price} onChange={setNum("price")} inputMode="numeric" placeholder="750000" className={INPUT} />
              {fUnit > 0 ? <div className="mt-1 pl-1 text-[11px] font-semibold text-sage-deep">회당 {won(fUnit)}</div> : null}
            </div>

            <div>
              <div className={FLABEL}>1회 정상가 (환불 기준, 원)</div>
              <input value={form.unitListPrice} onChange={setNum("unitListPrice")} inputMode="numeric" placeholder="자동 (판매가 ÷ 회차)" className={INPUT} />
            </div>

            <div>
              <div className={FLABEL}>상품명 (자동 생성)</div>
              <input
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value, nameTouched: true }))}
                placeholder="1:1 PT 10회권"
                className={INPUT}
              />
            </div>

            {editId !== "new" ? (
              <div className="flex items-center justify-between rounded-[13px] bg-[#FBF7F1] px-4 py-3">
                <span className="text-[13px] font-semibold text-[#766D60]">판매 중 (끄면 보관함으로)</span>
                <Switch on={editActive} onChange={onToggleActive} disabled={busy} label={editActive ? "판매" : "보관"} />
              </div>
            ) : null}
          </div>
        </ConsoleModal>
      ) : null}
    </Card>
  );
}

/* ============================================================
   할인 대상 자격(콘솔) — 가족·군경소방·노인 등. 가격이 아니라 '왜 할인 대상인지'만 관리한다.
   가격은 이름에 "특별할인"이 붙은 별도 상품이 담당(위 상품 폼의 특별할인 토글).
   자격은 4~6개 수준이라 모달 없이 인라인 리스트 + 추가/수정 폼 하나로 끝낸다.
   ============================================================ */

function DiscountsEditor({ discounts }: { discounts: DiscountItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [editId, setEditId] = useState<string | null>(null); // null = 추가 모드
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  function reset() { setEditId(null); setName(""); }
  function startEdit(d: DiscountItem) { setEditId(d.id); setName(d.name); }

  async function save() {
    if (busy) return;
    const nm = name.trim();
    if (!nm) return toast("자격 이름을 입력해주세요", "error");
    setBusy(true);
    const res = editId ? await updateDiscount(editId, { name: nm }) : await createDiscount({ name: nm });
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "저장에 실패했어요", "error");
    toast(editId ? "자격을 수정했어요" : "자격을 추가했어요");
    reset();
    router.refresh();
  }

  async function toggle(d: DiscountItem) {
    if (busy) return;
    setBusy(true);
    const res = await setDiscountActive(d.id, !d.active);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "상태 변경에 실패했어요", "error");
    if (editId === d.id) reset(); // 수정 중이던 항목을 중지하면 폼 초기화
    toast(!d.active ? "다시 사용해요" : "사용을 중지했어요");
    router.refresh();
  }

  return (
    <Card className="mb-[18px] px-6 py-[22px]">
      <div className="text-[16px] font-bold text-ink">할인 대상 자격</div>
      <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">가족·군경소방·노인 등 할인 대상 자격이에요. 자격이 있는 회원에겐 발급 시 특별할인 상품이 표시돼요</div>

      {discounts.length > 0 ? (
        <div className="mb-4 flex flex-col gap-1.5">
          {discounts.map((d) => (
            <div key={d.id} className={`flex items-center gap-3 rounded-[12px] bg-[#FBF9F5] px-4 py-3 ${d.active ? "" : "opacity-55"}`}>
              <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink">{d.name}</span>
              <Switch on={d.active} onChange={() => toggle(d)} disabled={busy} label={d.active ? "사용" : "중지"} />
              <button
                type="button"
                onClick={() => startEdit(d)}
                aria-label="수정"
                className={`flex h-8 w-8 items-center justify-center rounded-[9px] border transition ${editId === d.id ? "border-sage bg-[#EDF4E3] text-sage-deep" : "border-ink/[0.1] bg-white text-[#A89F92] hover:bg-[#F7F3EB]"}`}
              >
                <Icon name="pencil" size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {/* 추가 / 수정 폼 — 리스트의 수정 버튼이 이 폼에 값을 채운다 */}
      <div className="flex items-end gap-2.5">
        <div className="flex-1">
          <div className={FLABEL}>자격 이름</div>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="가족 할인" className={INPUT} />
        </div>
        {editId ? <OBtn onClick={reset} disabled={busy}>취소</OBtn> : null}
        <PBtn icon={editId ? "check-bold" : "plus-bold"} onClick={save} pending={busy}>{editId ? "저장" : "추가"}</PBtn>
      </div>
      <div className="mt-2.5 text-[11.5px] font-medium text-[#9A917F]">가격은 &lsquo;특별할인&rsquo; 상품이 담당해요. 여기선 자격 종류만 관리해요.</div>
    </Card>
  );
}
