"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { Card, PBtn, MicroLabel, won } from "@/components/console/ui";
import { PrivacyToggle } from "@/components/console/privacy";
import { createProduct, updateProduct, setProductActive, updatePolicy, updateNotifications } from "@/lib/data/groups/owner-ops-actions";
import { productTier, productType, composeProductName, type ProductTier } from "@/lib/data/product-class";
import type { MembershipProduct, StudioSettings } from "@/lib/types";

export function SettingsClient({ products, settings }: { products: MembershipProduct[]; settings: StudioSettings }) {
  const toast = useToast();

  const [noshow, setNoshow] = useState(settings.noshowDeducts);
  const [cutoff, setCutoff] = useState(settings.cancelCutoffHours);
  const [nExpiry, setNExpiry] = useState(settings.notifExpiry);
  const [nSession, setNSession] = useState(settings.notifSession);
  const [nPayment, setNPayment] = useState(settings.notifPayment);

  async function savePolicy(next: { noshowDeducts: boolean; cancelCutoffHours: number }) {
    const r = await updatePolicy(next);
    if (!r.ok) toast(r.error ?? "저장에 실패했어요");
  }
  async function saveNotif(next: { notifExpiry: boolean; notifSession: boolean; notifPayment: boolean }) {
    const r = await updateNotifications(next);
    if (!r.ok) toast(r.error ?? "저장에 실패했어요");
  }

  // 서버 데이터가 바뀔 때만(우리 저장 후 router.refresh 포함) 편집기를 리마운트해 로컬 편집 상태를 초기화.
  const sig = products.map((p) => `${p.id}:${p.name}:${p.sessions}:${p.price}:${p.durationDays}:${p.unitListPrice}:${p.active}:${p.sortOrder}`).join("|");

  return (
    <>
      <ProductsEditor key={sig} products={products} />

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
   회원권 상품 인라인 편집기 — 셀에서 바로 수정하고 변경분을 한 번에 저장.
   새 상품은 맨 아래 빈 줄에 입력하면 자동으로 줄이 늘어난다(콘솔 '한꺼번에 입력'과 동일 감각).
   active 토글만 즉시 반영(낙관적) — 나머지 필드는 배치 저장.
   ============================================================ */

type Row = { key: number; id?: string; name: string; sessions: string; durationDays: string; price: string; unitListPrice: string; active: boolean; auto?: boolean };

const digits = (s: string) => s.replace(/[^\d]/g, "");
const toInt = (s: string) => parseInt(digits(s) || "0", 10);
const effUnit = (r: Row) => {
  const u = toInt(r.unitListPrice);
  if (u > 0) return u;
  const se = toInt(r.sessions);
  return se > 0 ? Math.round(toInt(r.price) / se) : 0;
};

type PErr = "name" | "sessions" | "durationDays" | "price";
function rowErrors(r: Row): Set<PErr> {
  const e = new Set<PErr>();
  if (!r.name.trim()) e.add("name");
  if (toInt(r.sessions) < 1) e.add("sessions");
  if (toInt(r.durationDays) < 1) e.add("durationDays");
  if (toInt(r.price) < 1) e.add("price");
  return e;
}
const isBlank = (r: Row) => !r.name.trim() && !digits(r.sessions) && !digits(r.price);

const CELL = "w-full rounded-[10px] border bg-[#FBF9F5] px-2.5 py-[9px] text-[13.5px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C]";
const OK_B = "border-[rgba(75,59,46,0.14)]";
const ERR_B = "border-terracotta/60 bg-[#FDF4EE]";
const COLS = "grid grid-cols-[minmax(150px,1.5fr)_62px_78px_minmax(120px,1fr)_minmax(94px,0.9fr)_54px_24px] items-start gap-x-2";

let keySeq = 0;
const blank = (): Row => ({ key: keySeq++, name: "", sessions: "", durationDays: "60", price: "", unitListPrice: "", active: true, auto: true });

const TIER_LABEL: Record<ProductTier, string> = { owner: "대표", staff: "강사", common: "공용" };
/** 목록 정렬: 유형(1:1→2:1→기타) 다음 회차 오름차순 — 가격표처럼 위치를 예측할 수 있게. */
const typeOrd = (name: string) => (productType(name) === "1on1" ? 0 : productType(name) === "2on1" ? 1 : 2);

function ProductsEditor({ products }: { products: MembershipProduct[] }) {
  const router = useRouter();
  const toast = useToast();
  const [rows, setRows] = useState<Row[]>(() =>
    products.map((p) => ({
      key: keySeq++, id: p.id, name: p.name, sessions: String(p.sessions),
      durationDays: String(p.durationDays), price: String(p.price),
      unitListPrice: p.unitListPrice ? String(p.unitListPrice) : "", active: p.active,
    })),
  );
  const [news, setNews] = useState<Row[]>(() => [blank()]);
  const [busy, setBusy] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  // 새 상품 이름 자동 조합 기본값 — 담당·유형을 정해두면 회차만 입력해도 규칙에 맞는 이름이 생성된다.
  const [newTier, setNewTier] = useState<ProductTier>("common");
  const [newType, setNewType] = useState<"1on1" | "2on1">("1on1");

  const byId = new Map(products.map((p) => [p.id, p]));
  function dirty(r: Row): boolean {
    const p = r.id ? byId.get(r.id) : undefined;
    if (!p) return false;
    return (
      r.name.trim() !== p.name ||
      toInt(r.sessions) !== p.sessions ||
      toInt(r.durationDays) !== p.durationDays ||
      toInt(r.price) !== p.price ||
      effUnit(r) !== p.unitListPrice
    );
  }

  function patchRow(key: number, part: Partial<Row>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...part } : r)));
  }
  function patchNew(key: number, part: Partial<Row>) {
    setNews((prev) => {
      const next = prev.map((r) => {
        if (r.key !== key) return r;
        // 이름을 직접 수정하면 자동 조합 중단, 아니면 회차 입력에 맞춰 이름 자동 생성.
        const merged = { ...r, ...part, ...("name" in part ? { auto: false } : {}) };
        if (merged.auto !== false && !("name" in part)) {
          const n = toInt(merged.sessions);
          if (n > 0) merged.name = composeProductName(newTier, newType, n);
        }
        return merged;
      });
      if (!isBlank(next[next.length - 1])) next.push(blank()); // 스프레드시트: 마지막 줄 채워지면 빈 줄 추가
      return next;
    });
  }
  /** 담당/유형 조합 변경 — 자동 이름 상태인 신규 줄들의 이름을 새 조합으로 재생성. */
  function setComposer(tier: ProductTier, type: "1on1" | "2on1") {
    setNewTier(tier);
    setNewType(type);
    setNews((prev) =>
      prev.map((r) =>
        r.auto !== false && toInt(r.sessions) > 0 ? { ...r, name: composeProductName(tier, type, toInt(r.sessions)) } : r,
      ),
    );
  }
  function removeNew(key: number) {
    setNews((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [blank()];
    });
  }

  async function toggleActive(r: Row) {
    if (!r.id) return;
    const next = !r.active;
    patchRow(r.key, { active: next }); // 낙관적 — active는 즉시 저장(배치 대상 아님)
    const res = await setProductActive(r.id, next);
    if (!res.ok) {
      patchRow(r.key, { active: !next });
      toast(res.error ?? "상태 변경에 실패했어요");
    }
  }

  const dirtyRows = rows.filter(dirty);
  const validNew = news.filter((r) => !isBlank(r) && rowErrors(r).size === 0);
  const errCount =
    dirtyRows.filter((r) => rowErrors(r).size > 0).length +
    news.filter((r) => !isBlank(r) && rowErrors(r).size > 0).length;
  const pending = dirtyRows.length + validNew.length;
  const canSave = pending > 0 && errCount === 0 && !busy;

  async function saveAll() {
    if (!canSave) return;
    setBusy(true);
    const jobs: Promise<{ ok: boolean; error?: string }>[] = [
      ...dirtyRows
        .filter((r) => rowErrors(r).size === 0)
        .map((r) =>
          updateProduct(r.id!, {
            name: r.name.trim(), sessions: toInt(r.sessions), price: toInt(r.price),
            unitListPrice: effUnit(r), durationDays: toInt(r.durationDays),
          }),
        ),
      ...validNew.map((r) =>
        createProduct({
          name: r.name.trim(), sessions: toInt(r.sessions), price: toInt(r.price),
          unitListPrice: effUnit(r), durationDays: toInt(r.durationDays),
        }),
      ),
    ];
    const results = await Promise.all(jobs);
    setBusy(false);
    const failed = results.filter((r) => !r.ok).length;
    if (failed) toast(`${results.length - failed}건 저장 · ${failed}건 실패`);
    else toast(`${results.length}건 저장했어요`);
    router.refresh(); // 성공 시 sig 변경 → 편집기 리마운트로 상태 초기화(신규 행에 실제 id 반영)
  }

  return (
    <Card className="mb-[18px] px-6 py-[22px]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <div className="text-[16px] font-bold text-ink">회원권 상품</div>
          <div className="mt-0.5 text-[12px] font-medium text-[#9A917F]">칸을 눌러 바로 수정하고, 아래 빈 줄에 새 상품을 입력하세요</div>
        </div>
        <div className="flex items-center gap-2.5">
          {errCount > 0 ? <span className="text-[12px] font-semibold text-terracotta">입력 오류 {errCount}건</span> : null}
          {pending > 0 && errCount === 0 ? <span className="text-[12px] font-semibold text-[#9A917F]">변경 {pending}건</span> : null}
          <PBtn icon="check-bold" disabled={!canSave} onClick={saveAll}>{busy ? "저장 중…" : "변경사항 저장"}</PBtn>
        </div>
      </div>

      {/* header */}
      <div className={`${COLS} border-b border-[rgba(75,59,46,0.08)] px-1 pb-2 text-[11px] font-semibold tracking-[0.02em] text-[#9A917F]`}>
        <span>상품명</span><span className="text-center">횟수</span><span className="text-center">기간(일)</span><span>판매가</span><span>정가(회당)</span><span className="text-center">활성</span><span />
      </div>

      {/* existing rows — 담당(대표/강사/공용) 섹션 × 유형·회차 정렬. 그룹 기준은 서버 데이터(저장 전 편집으로 줄이 튀지 않게). */}
      <div className="flex flex-col gap-2 pt-2.5">
        {(() => {
          const rowById = new Map(rows.filter((r) => r.id).map((r) => [r.id!, r]));
          const cmp = (a: MembershipProduct, b: MembershipProduct) =>
            typeOrd(a.name) - typeOrd(b.name) || a.sessions - b.sessions || a.price - b.price;
          const activeP = products.filter((p) => p.active);
          const groups = (["owner", "staff", "common"] as ProductTier[])
            .map((t) => ({ t, items: activeP.filter((p) => productTier(p.name) === t).sort(cmp) }))
            .filter((g) => g.items.length > 0);
          const showHeaders = groups.length > 1;
          const renderRow = (r: Row) => {
            const errs = dirty(r) ? rowErrors(r) : new Set<PErr>();
            const b = (f: PErr) => (errs.has(f) ? ERR_B : OK_B);
            const unit = effUnit(r);
            return (
              <div key={r.key} className={`${COLS} rounded-[10px] px-1 py-0.5 ${dirty(r) ? "bg-[#FBF7F1]" : ""}`} style={{ opacity: r.active ? 1 : 0.55 }}>
                <input value={r.name} onChange={(e) => patchRow(r.key, { name: e.target.value })} className={`${CELL} ${b("name")}`} />
                <input value={r.sessions} onChange={(e) => patchRow(r.key, { sessions: digits(e.target.value) })} inputMode="numeric" className={`${CELL} text-center ${b("sessions")}`} />
                <input value={r.durationDays} onChange={(e) => patchRow(r.key, { durationDays: digits(e.target.value) })} inputMode="numeric" className={`${CELL} text-center ${b("durationDays")}`} />
                <div>
                  <input value={r.price} onChange={(e) => patchRow(r.key, { price: digits(e.target.value) })} inputMode="numeric" className={`${CELL} ${b("price")}`} />
                  {unit > 0 ? <div className="mt-[3px] pl-1 text-[10.5px] font-semibold text-sage-deep">회당 {won(unit)}</div> : null}
                </div>
                <input value={r.unitListPrice} onChange={(e) => patchRow(r.key, { unitListPrice: digits(e.target.value) })} inputMode="numeric" placeholder="자동" className={`${CELL} ${OK_B}`} />
                <div className="flex justify-center pt-1.5"><Switch on={r.active} onChange={() => toggleActive(r)} /></div>
                <span />
              </div>
            );
          };
          const archivedP = products.filter((p) => !p.active);
          return (
            <>
              {groups.map((g) => (
                <div key={g.t} className="flex flex-col gap-2">
                  {showHeaders ? (
                    <div className="pt-1.5 text-[11.5px] font-bold tracking-[0.02em] text-[#8A6F3E]">{TIER_LABEL[g.t]}</div>
                  ) : null}
                  {g.items.map((p) => rowById.get(p.id)).filter((r): r is Row => !!r).map(renderRow)}
                </div>
              ))}
              {activeP.length === 0 ? (
                <div className="py-2 text-center text-[12.5px] font-medium text-[#A89F92]">판매 중인 상품이 없어요 — 아래에 첫 상품을 추가하세요</div>
              ) : null}
              {/* 보관함(비활성) — 접힘 기본. 은퇴 상품이 작업 목록을 밀어내지 않게. */}
              {archivedP.length > 0 ? (
                <div className="mt-1">
                  <button
                    type="button"
                    onClick={() => setArchiveOpen((v) => !v)}
                    className="flex w-full items-center gap-1.5 rounded-[10px] bg-[#F8F4EC] px-3 py-2.5 text-left transition hover:bg-[#F4EFE6]"
                  >
                    <Icon name={archiveOpen ? "chevron-down" : "chevron-right"} size={13} className="flex-none text-[#A89F92]" />
                    <span className="text-[12px] font-semibold text-[#766D60]">보관된 상품 {archivedP.length}개 · 발급 화면에 표시되지 않아요</span>
                  </button>
                  {archiveOpen ? (
                    <div className="flex flex-col gap-2 pt-2">
                      {archivedP.sort(cmp).map((p) => rowById.get(p.id)).filter((r): r is Row => !!r).map(renderRow)}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          );
        })()}
      </div>

      {/* new rows — 담당·유형 조합을 정하면 회차 입력만으로 규칙에 맞는 상품명이 생성된다 */}
      <div className="mt-4">
        <div className="mb-2 flex items-center gap-3">
          <MicroLabel>새 상품 추가</MicroLabel>
          <div className="flex items-center gap-1">
            {(["common", "owner", "staff"] as ProductTier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setComposer(t, newType)}
                className={`rounded-[8px] px-2.5 py-[5px] text-[11.5px] font-semibold transition ${newTier === t ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"}`}
              >
                {TIER_LABEL[t]}
              </button>
            ))}
          </div>
          <div className="h-4 w-px bg-[rgba(75,59,46,0.14)]" />
          <div className="flex items-center gap-1">
            {(["1on1", "2on1"] as const).map((tp) => (
              <button
                key={tp}
                type="button"
                onClick={() => setComposer(newTier, tp)}
                className={`rounded-[8px] px-2.5 py-[5px] text-[11.5px] font-semibold transition ${newType === tp ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"}`}
              >
                {tp === "1on1" ? "1:1" : "2:1"}
              </button>
            ))}
          </div>
          <span className="text-[11px] font-medium text-[#9A917F]">횟수를 입력하면 상품명이 자동으로 만들어져요</span>
        </div>
        <div className="flex flex-col gap-2">
          {news.map((r) => {
            const errs = isBlank(r) ? new Set<PErr>() : rowErrors(r);
            const b = (f: PErr) => (errs.has(f) ? ERR_B : OK_B);
            const unit = effUnit(r);
            return (
              <div key={r.key} className={COLS}>
                <input value={r.name} onChange={(e) => patchNew(r.key, { name: e.target.value })} placeholder={composeProductName(newTier, newType, 20)} className={`${CELL} ${b("name")}`} />
                <input value={r.sessions} onChange={(e) => patchNew(r.key, { sessions: digits(e.target.value) })} inputMode="numeric" placeholder="20" className={`${CELL} text-center ${b("sessions")}`} />
                <input value={r.durationDays} onChange={(e) => patchNew(r.key, { durationDays: digits(e.target.value) })} inputMode="numeric" placeholder="60" className={`${CELL} text-center ${b("durationDays")}`} />
                <div>
                  <input value={r.price} onChange={(e) => patchNew(r.key, { price: digits(e.target.value) })} inputMode="numeric" placeholder="1400000" className={`${CELL} ${b("price")}`} />
                  {unit > 0 ? <div className="mt-[3px] pl-1 text-[10.5px] font-semibold text-sage-deep">회당 {won(unit)}</div> : null}
                </div>
                <input value={r.unitListPrice} onChange={(e) => patchNew(r.key, { unitListPrice: digits(e.target.value) })} inputMode="numeric" placeholder="자동" className={`${CELL} ${OK_B}`} />
                <span className="pt-2 text-center text-[10.5px] font-semibold text-sage-deep">신규</span>
                {isBlank(r) ? <span /> : (
                  <button type="button" onClick={() => removeNew(r.key)} aria-label="줄 삭제" className="mt-[9px] flex h-5 w-5 items-center justify-center justify-self-center rounded-full text-[#C2BAAD] transition hover:bg-[#F4EFE6] hover:text-terracotta">
                    <Icon name="close" size={12} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
