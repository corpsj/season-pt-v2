"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Card, PBtn, OBtn, ConsoleModal, won } from "@/components/console/ui";
import { PrivacyToggle } from "@/components/console/privacy";
import { createProduct, updateProduct, setProductActive, updatePolicy, updateNotifications, createExercise, renameExercise, setExerciseActive, createNotice, deleteNotice } from "@/lib/data/groups/owner-ops-actions";
import { updateMyName } from "@/lib/auth/trainer-actions";
import { productTier, productType, composeProductName, isDiscountProduct, matchesPickerFilter, type ProductTier, type PickerFilter } from "@/lib/data/product-class";
import type { MembershipProduct, StudioSettings, ExerciseItem } from "@/lib/types";
import type { OwnerNotice } from "@/lib/data/groups/owner-ops";

export function SettingsClient({ products, settings, exercises, notices, displayName }: { products: MembershipProduct[]; settings: StudioSettings; exercises: ExerciseItem[]; notices: OwnerNotice[]; displayName: string }) {
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
      <MyInfoEditor displayName={displayName} />

      <ProductsEditor products={products} />

      <ExercisesEditor exercises={exercises} />

      <NoticesEditor notices={notices} />

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
const TIER_HEAD: Record<ProductTier, string> = {
  owner: "bg-[#F4EEE3] text-[#8A6F3E]",
  staff: "bg-[#E4EFE3] text-[#5C9166]",
  common: "bg-[#F0ECE3] text-[#847A66]",
};
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
  const [typeFilter, setTypeFilter] = useState<PickerFilter>("1on1");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [editId, setEditId] = useState<string | "new" | null>(null);
  const [editActive, setEditActive] = useState(true); // 모달 안 판매 상태 표시용
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => products.filter((p) => p.active), [products]);
  const archived = useMemo(() => products.filter((p) => !p.active), [products]);

  // 발급 픽커와 동일한 1:1/2:1/특별할인 3분류(matchesPickerFilter 단일 소스) — 담당(대표/강사)은 카드 뱃지로 구분.
  const visible = useMemo(
    () => active.filter((p) => matchesPickerFilter(p.name, typeFilter)),
    [active, typeFilter],
  );

  // 담당 섹션: 대표 → 강사 → 공용, 비어있는 섹션은 생략(유형은 필터+카드 뱃지로 구분).
  const sections = useMemo(() => {
    const g: Record<ProductTier, MembershipProduct[]> = { owner: [], staff: [], common: [] };
    for (const p of visible) g[productTier(p.name)].push(p);
    return (["owner", "staff", "common"] as ProductTier[])
      .map((k) => ({ key: k, label: TIER_LABEL[k], items: g[k].sort(bySessionsAsc) }))
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

      {/* 분류 필터 — 발급 픽커와 동일한 3칩 */}
      <div className="mb-4 flex items-center gap-[6px]">
        {([
          { key: "1on1", label: "1:1" },
          { key: "2on1", label: "2:1" },
          { key: "discount", label: "특별할인" },
        ] as { key: PickerFilter; label: string }[]).map((f) => (
          <button key={f.key} type="button" onClick={() => setTypeFilter(f.key)} className={pillCls(typeFilter === f.key)}>{f.label}</button>
        ))}
      </div>

      {/* 판매 중 — 유형 섹션 × 회차 칩 그리드 */}
      {sections.length === 0 ? (
        <div className="rounded-[13px] bg-[#FBF7F1] py-8 text-center text-[13px] font-medium text-[#A89F92]">
          {active.length > 0 ? "이 분류에 상품이 없어요" : "등록된 상품이 없어요 — ‘상품 추가’로 시작하세요"}
        </div>
      ) : (
        sections.map((sec) => (
          <div key={sec.key} className="mb-4 last:mb-0">
            <div className="mb-2 flex items-center gap-2">
              <span className={`rounded-[6px] px-2 py-0.5 text-[11.5px] font-bold ${TIER_HEAD[sec.key]}`}>{sec.label}</span>
              <span className="text-[11.5px] font-medium text-[#9A917F]">{sec.items.length}개</span>
            </div>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
              {sec.items.map((p) => {
                const type = productType(p.name);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openEdit(p)}
                    className="rounded-[13px] border border-ink/[0.08] bg-[#FBF9F5] px-3.5 py-3 text-left transition hover:bg-[#F7F3EB]"
                  >
                    <div className="flex flex-wrap items-baseline gap-1.5">
                      <span className="min-w-0 truncate text-[15px] font-bold text-ink">
                        {type ? `${p.sessions}회` : p.name}
                      </span>
                      {type ? (
                        <span className="flex-none rounded-[6px] bg-[#EFEBE2] px-1.5 py-0.5 text-[10.5px] font-bold text-[#847A66]">
                          {TYPE_LABEL[type]}
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
                      {type ? `유효 ${p.durationDays}일` : `${p.sessions}회 · ${p.durationDays}일`}
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
                <div className="mt-px text-[11px] font-medium text-[#9A917F]">발급 화면의 특별할인 탭에 표시돼요</div>
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
   내 정보 — 표시 이름 인라인 수정(updateMyName). 콘솔 상단 작은 카드.
   ============================================================ */
function MyInfoEditor({ displayName }: { displayName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);

  async function save() {
    const v = name.trim();
    if (!v || busy) return;
    setBusy(true);
    const r = await updateMyName(v);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "이름 변경에 실패했어요", "error");
    setEditing(false);
    toast("이름을 수정했어요");
    router.refresh();
  }

  return (
    <Card className="mb-[18px] px-6 py-[22px]">
      <div className="text-[16px] font-bold text-ink">내 정보</div>
      <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">회원·강사에게 보이는 표시 이름</div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setName(displayName); setEditing(false); } }}
            autoFocus
            maxLength={20}
            placeholder="표시 이름"
            className={`${INPUT} max-w-[280px]`}
          />
          <PBtn icon="check-bold" pending={busy} onClick={save}>저장</PBtn>
          <OBtn onClick={() => { setName(displayName); setEditing(false); }}>취소</OBtn>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-[13px] bg-[#FBF7F1] px-4 py-3.5">
          <Icon name="person" size={18} className="text-sage-deep" />
          <span className="flex-1 text-[14px] font-semibold text-ink">{displayName || "이름 없음"}</span>
          <OBtn icon="pencil" onClick={() => { setName(displayName); setEditing(true); }}>이름 수정</OBtn>
        </div>
      )}
    </Card>
  );
}

/* ============================================================
   운동 종목 — 추가/이름변경/활성토글(createExercise/renameExercise/setExerciseActive).
   카테고리별 그룹. 모바일 /t/settings/exercises와 동일한 감각을 콘솔 스타일로.
   ============================================================ */
const EXERCISE_CATEGORIES = ["하체", "가슴", "등", "어깨", "팔", "코어", "전신", "유산소"];

function ExercisesEditor({ exercises: init }: { exercises: ExerciseItem[] }) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(init);
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const categoryOptions = [
    ...EXERCISE_CATEGORIES,
    ...items.map((e) => e.category).filter((c): c is string => !!c).filter((c) => !EXERCISE_CATEGORIES.includes(c)).sort(),
  ].filter((v, i, arr) => arr.indexOf(v) === i);

  async function handleAdd() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await createExercise(name, newCategory || undefined);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "추가에 실패했어요", "error");
    setNewName("");
    setNewCategory("");
    toast("종목을 추가했어요");
    router.refresh();
  }

  async function handleRename(id: string) {
    const name = editName.trim();
    if (!name || busy) return;
    setBusy(true);
    const res = await renameExercise(id, name, editCategory || undefined);
    setBusy(false);
    if (!res.ok) return toast(res.error ?? "이름 변경에 실패했어요", "error");
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, name, category: editCategory || null } : e)));
    setEditingId(null);
    toast("수정했어요");
  }

  async function handleToggle(id: string, active: boolean) {
    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, active } : e)));
    const res = await setExerciseActive(id, active);
    if (!res.ok) {
      setItems((prev) => prev.map((e) => (e.id === id ? { ...e, active: !active } : e)));
      toast(res.error ?? "상태 변경에 실패했어요", "error");
    }
  }

  // 카테고리별 그룹: 알려진 순서 먼저, 나머지, "기타"(무카테고리) 마지막.
  const byCategory = new Map<string, ExerciseItem[]>();
  const noCategory: ExerciseItem[] = [];
  for (const it of items) {
    const cat = it.category?.trim() || null;
    if (!cat) noCategory.push(it);
    else byCategory.set(cat, [...(byCategory.get(cat) ?? []), it]);
  }
  const grouped: { label: string; items: ExerciseItem[] }[] = [];
  for (const cat of categoryOptions) { const arr = byCategory.get(cat); if (arr?.length) grouped.push({ label: cat, items: arr }); }
  for (const [cat, arr] of byCategory) { if (!categoryOptions.includes(cat)) grouped.push({ label: cat, items: arr }); }
  if (noCategory.length) grouped.push({ label: "기타", items: noCategory });

  return (
    <Card className="mb-[18px] px-6 py-[22px]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[16px] font-bold text-ink">운동 종목</div>
          <div className="mt-0.5 text-[12px] font-medium text-[#9A917F]">수업 기록에서 고르는 종목이에요</div>
        </div>
      </div>

      {/* 추가 */}
      <div className="mb-5 flex items-center gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          placeholder="새 종목 이름"
          className={`${INPUT} flex-1`}
        />
        <input
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value)}
          list="console-exercise-cats"
          placeholder="카테고리"
          className={`${INPUT} w-[160px]`}
        />
        <datalist id="console-exercise-cats">{categoryOptions.map((c) => <option key={c} value={c} />)}</datalist>
        <PBtn icon="plus-bold" pending={busy} onClick={handleAdd}>추가</PBtn>
      </div>

      {items.length === 0 ? (
        <div className="rounded-[13px] bg-[#FBF7F1] py-8 text-center text-[13px] font-medium text-[#A89F92]">등록된 종목이 없어요</div>
      ) : (
        grouped.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-[6px] bg-[#F0ECE3] px-2 py-0.5 text-[11.5px] font-bold text-[#847A66]">{group.label}</span>
              <span className="text-[11.5px] font-medium text-[#9A917F]">{group.items.length}개</span>
            </div>
            <div className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 rounded-[11px] bg-[#FBF9F5] px-3.5 py-2.5">
                  {editingId === item.id ? (
                    <>
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleRename(item.id); if (e.key === "Escape") setEditingId(null); }}
                        autoFocus
                        className={`${INPUT} flex-1`}
                      />
                      <input
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value)}
                        list="console-exercise-cats"
                        placeholder="카테고리"
                        className={`${INPUT} w-[140px]`}
                      />
                      <PBtn icon="check-bold" pending={busy} onClick={() => handleRename(item.id)}>저장</PBtn>
                      <OBtn onClick={() => setEditingId(null)}>취소</OBtn>
                    </>
                  ) : (
                    <>
                      <span className={`flex-1 text-[14px] font-semibold ${item.active ? "text-ink" : "text-[#A89F92] line-through"}`}>{item.name}</span>
                      <button
                        type="button"
                        onClick={() => { setEditingId(item.id); setEditName(item.name); setEditCategory(item.category ?? ""); }}
                        className="text-[13px] font-semibold text-sage-deep"
                      >
                        수정
                      </button>
                      <Switch on={item.active} onChange={(v) => handleToggle(item.id, v)} label={item.active ? "활성" : "비활성"} />
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </Card>
  );
}

/* ============================================================
   공지사항 — 게시/삭제(createNotice/deleteNotice). 회원 앱 공지사항에 노출.
   ============================================================ */
const NOTICE_CATS = [
  { key: "ops", label: "운영" },
  { key: "important", label: "중요" },
  { key: "facility", label: "시설" },
] as const;

function NoticesEditor({ notices }: { notices: OwnerNotice[] }) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [cat, setCat] = useState<"important" | "ops" | "facility">("ops");
  const [busy, setBusy] = useState(false);

  async function add() {
    if (!title.trim()) return toast("제목을 입력해주세요", "error");
    if (busy) return;
    setBusy(true);
    const r = await createNotice({ title, body, category: cat });
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "작성에 실패했어요", "error");
    setTitle("");
    setBody("");
    toast("공지를 게시했어요");
    router.refresh();
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "이 공지를 삭제할까요?", description: "회원에게 더 이상 보이지 않아요.", confirmLabel: "삭제", tone: "warn" }))) return;
    setBusy(true);
    const r = await deleteNotice(id);
    setBusy(false);
    if (!r.ok) return toast(r.error ?? "삭제에 실패했어요", "error");
    toast("삭제했어요");
    router.refresh();
  }

  return (
    <Card className="mb-[18px] px-6 py-[22px]">
      <div className="text-[16px] font-bold text-ink">공지사항</div>
      <div className="mb-4 mt-1 text-[12px] font-medium text-[#9A917F]">회원 앱 공지사항에 게시돼요</div>

      {/* 작성 */}
      <div className="mb-5 rounded-[13px] bg-[#FBF7F1] px-4 py-4">
        <div className="mb-3 flex items-center gap-[6px]">
          {NOTICE_CATS.map((c) => (
            <button key={c.key} type="button" onClick={() => setCat(c.key)} className={pillCls(cat === c.key)}>{c.label}</button>
          ))}
        </div>
        <div className="flex flex-col gap-2.5">
          <div>
            <div className={FLABEL}>제목</div>
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예: 추석 휴관 안내" className={INPUT} />
          </div>
          <div>
            <div className={FLABEL}>내용</div>
            <input value={body} onChange={(e) => setBody(e.target.value)} placeholder="자세한 안내 (선택)" className={INPUT} />
          </div>
          <PBtn icon="plus-bold" pending={busy} onClick={add} className="self-start">회원 앱에 게시</PBtn>
        </div>
      </div>

      {/* 목록 */}
      {notices.length === 0 ? (
        <div className="rounded-[13px] bg-[#FBF7F1] py-8 text-center text-[13px] font-medium text-[#A89F92]">게시된 공지가 없어요</div>
      ) : (
        <div className="flex flex-col gap-2">
          {notices.map((n) => (
            <div key={n.id} className="flex items-start gap-3 rounded-[13px] border border-ink/[0.08] bg-[#FBF9F5] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-sage-deep">{n.tag}</span>
                  <span className="text-[11px] text-[#A89F92]">{n.dateLabel}</span>
                </div>
                <div className="mt-1 text-[14px] font-bold text-ink">{n.title}</div>
                {n.body ? <div className="mt-0.5 text-[12.5px] leading-[1.5] text-[#766D60]">{n.body}</div> : null}
              </div>
              <button
                type="button"
                onClick={() => remove(n.id)}
                disabled={busy}
                aria-label="삭제"
                className="flex-none rounded-full p-1 text-[#A89F92] transition hover:text-terracotta"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

