// client-only(부모 ui.tsx가 "use client" 경계) — 직접 서버 컴포넌트에서 import하지 말 것.
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { OBtn, PBtn, ConsoleModal } from "@/components/console/ui";
import { bulkAddMembers } from "@/lib/data/groups/carryover-actions";
import type { CarrySlot } from "@/lib/import/carryover-parse";
import type { Gender, MembershipProduct } from "@/lib/types";

/* ============================================================
   한꺼번에 입력 — 콘솔에서 여러 회원을 스프레드시트처럼 직접 입력해
   일괄 등록(회원 + 담당강사 + 정기일정 + 선택 회원권). CSV 업로드 대체.
   ============================================================ */

export type TrainerOpt = { id: string; name: string };

type Draft = {
  key: number;
  name: string;
  phone: string;
  birth: string; // YYMMDD
  gender: Gender;
  productId: string; // "" = 회원권 없음
  remaining: string;
  startDate: string; // YYYY-MM-DD
  slots: CarrySlot[];
  trainerId: string;
};

const WD_KO = ["일", "월", "화", "수", "목", "금", "토"];
const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 표시 순서: 월~일
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 6~23시

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function addDays(iso: string, days: number): string | null {
  const t = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(t.getTime())) return null;
  return new Date(t.getTime() + days * 86400000).toISOString().slice(0, 10);
}
const slotLabel = (s: CarrySlot) => `${WD_KO[s.weekday]} ${s.hour}:${s.minute === 30 ? "30" : "00"}`;
const slotSort = (a: CarrySlot, b: CarrySlot) =>
  ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7) || a.hour - b.hour || a.minute - b.minute;

const isEmpty = (r: Draft) => !r.name.trim() && !r.phone.trim() && !r.birth.trim() && !r.productId && r.slots.length === 0;

let keySeq = 0; // React key 전용 증가 카운터(행 식별에만 사용, 렌더 값 아님)

type Field = "name" | "phone" | "birth" | "remaining" | "startDate";
function rowErrors(r: Draft, products: MembershipProduct[]): Set<Field> {
  const e = new Set<Field>();
  if (!r.name.trim()) e.add("name");
  if (r.phone.replace(/\D/g, "").length < 9) e.add("phone");
  if (r.birth.replace(/\D/g, "").length !== 6) e.add("birth");
  if (r.productId) {
    const p = products.find((pp) => pp.id === r.productId);
    const n = Number(r.remaining);
    if (r.remaining === "" || !Number.isInteger(n) || n < 0 || (p && n > p.sessions)) e.add("remaining");
    if (!r.startDate) e.add("startDate");
  }
  return e;
}

/* ----- 셀 공통 스타일 ----- */
const CELL = "w-full rounded-[10px] border bg-[#FBF9F5] px-2.5 py-[8px] text-[13px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 placeholder:text-[#B3AA9C] disabled:opacity-40";
const OK_B = "border-[rgba(75,59,46,0.14)]";
const ERR_B = "border-terracotta/60 bg-[#FDF4EE]";
const COLS = "grid grid-cols-[minmax(84px,1fr)_116px_74px_46px_minmax(110px,1fr)_54px_138px_minmax(150px,1.35fr)_98px_26px] items-start gap-x-[6px]";

export function BulkAddModal({
  products,
  trainers,
  onClose,
  onDone,
}: {
  products: MembershipProduct[];
  trainers: TrainerOpt[];
  onClose: () => void;
  onDone: () => void;
}) {
  const fresh = (): Draft => ({
    key: keySeq++,
    name: "", phone: "", birth: "", gender: "female",
    productId: "", remaining: "", startDate: kstToday(), slots: [],
    trainerId: trainers[0]?.id ?? "",
  });
  const [rows, setRows] = useState<Draft[]>(() => Array.from({ length: 5 }, fresh));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(null);

  // 스프레드시트처럼: 마지막 행에 입력이 생기면 빈 행 자동 추가.
  function patch(key: number, part: Partial<Draft>) {
    setRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...part } : r));
      if (!isEmpty(next[next.length - 1])) next.push(fresh());
      return next;
    });
  }
  function removeRow(key: number) {
    setRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      return next.length ? next : [fresh()];
    });
  }

  const filled = rows.filter((r) => !isEmpty(r));
  const errCount = filled.filter((r) => rowErrors(r, products).size > 0).length;
  const validCount = filled.length - errCount;

  async function submit() {
    if (busy || validCount === 0 || errCount > 0) return;
    setBusy(true);
    setErr(null);
    const res = await bulkAddMembers(
      filled.map((r) => ({
        name: r.name, phone: r.phone, birth: r.birth.replace(/\D/g, ""), gender: r.gender,
        productId: r.productId || null,
        remaining: r.productId ? Number(r.remaining) : null,
        startDate: r.productId ? r.startDate : null,
        slots: r.slots,
        trainerId: r.trainerId || null,
      })),
    );
    setBusy(false);
    if (!res.ok && res.created === 0 && res.failed.length === 0) {
      setErr(res.error ?? "등록에 실패했어요");
      return;
    }
    setResult({ created: res.created, failed: res.failed });
    onDone();
  }

  return (
    <ConsoleModal
      title="한꺼번에 입력"
      width={1150}
      onClose={onClose}
      footer={
        result ? (
          <PBtn icon="check-bold" className="flex-1" onClick={onClose}>완료</PBtn>
        ) : (
          <>
            <span className="mr-auto self-center text-[12.5px] font-semibold text-[#9A917F]">
              입력 {filled.length}명
              {errCount > 0 ? <span className="text-terracotta"> · 오류 {errCount}명</span> : null}
            </span>
            <OBtn onClick={onClose}>취소</OBtn>
            <PBtn icon="check-bold" disabled={busy || validCount === 0 || errCount > 0} onClick={submit}>
              {busy ? "등록 중…" : `${validCount}명 등록`}
            </PBtn>
          </>
        )
      }
    >
      {result ? (
        <div>
          <div className="mb-4 rounded-[14px] bg-[#EDF4E3] px-[18px] py-4 text-center">
            <div className="text-[13px] font-medium text-[#5B6452]">등록 완료</div>
            <div className="mt-0.5 text-[26px] font-bold text-sage-deep">{result.created}명</div>
          </div>
          {result.failed.length > 0 ? (
            <>
              <div className="mb-2 text-[11.5px] font-semibold text-[#9A917F]">실패 {result.failed.length}건</div>
              <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
                {result.failed.map((fr, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-[11px] bg-[#FBF3E9] px-3.5 py-2.5">
                    <Icon name="triangle-exclamation" size={15} className="flex-none text-terracotta" />
                    <span className="flex-1 truncate text-[12.5px] font-semibold text-[#5B5345]">{fr.name}</span>
                    <span className="text-[11.5px] font-medium text-[#9A8772]">{fr.error}</span>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="mb-3.5 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
            <Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" />
            <span className="text-[12px] font-medium leading-relaxed text-[#766D60]">
              상품을 고르면 <b className="font-semibold text-[#5B5345]">등록일 + 상품 유효기간</b>으로 만료일이 자동 계산돼요.
              잔여횟수는 기존 회원 이관 시 남은 횟수로 고쳐주세요. 결제는 기록되지 않아 매출에 잡히지 않아요 — 신규 결제는 등록 후 결제 화면에서 기록해주세요.
            </span>
          </div>

          {/* header */}
          <div className={`${COLS} sticky top-0 z-10 -mx-1 rounded-[8px] bg-white px-1 pb-1.5 pt-1 text-[11px] font-semibold tracking-[0.02em] text-[#9A917F]`}>
            <span>이름</span><span>연락처</span><span>생년월일</span><span>성별</span><span>상품</span><span>잔여</span><span>등록일</span><span>수업 일정</span><span>담당강사</span><span />
          </div>

          <div className="flex flex-col gap-[7px]">
            {rows.map((r) => {
              const empty = isEmpty(r);
              const errs = empty ? new Set<Field>() : rowErrors(r, products);
              const prod = products.find((p) => p.id === r.productId);
              const end = prod && r.startDate ? addDays(r.startDate, prod.durationDays) : null;
              const b = (f: Field) => (errs.has(f) ? ERR_B : OK_B);
              return (
                <div key={r.key} className={COLS}>
                  <input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder="이름" className={`${CELL} ${b("name")}`} />
                  <input value={r.phone} onChange={(e) => patch(r.key, { phone: e.target.value })} placeholder="010-0000-0000" inputMode="tel" className={`${CELL} ${b("phone")}`} />
                  <input value={r.birth} onChange={(e) => patch(r.key, { birth: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="YYMMDD" inputMode="numeric" className={`${CELL} ${b("birth")}`} />
                  {/* 성별: 클릭마다 여↔남 토글 — 드롭다운보다 빠름 */}
                  <button
                    type="button"
                    onClick={() => patch(r.key, { gender: r.gender === "female" ? "male" : "female" })}
                    aria-label="성별 전환"
                    title="클릭하여 여/남 전환"
                    className={`rounded-[10px] border py-[8px] text-[13px] font-semibold transition ${OK_B} ${r.gender === "female" ? "bg-[#FBF9F5] text-[#8A6F5B]" : "bg-[#F0F3F6] text-[#48586A]"}`}
                  >
                    {r.gender === "female" ? "여" : "남"}
                  </button>
                  <select
                    value={r.productId}
                    onChange={(e) => {
                      const p = products.find((pp) => pp.id === e.target.value);
                      patch(r.key, { productId: e.target.value, remaining: p ? String(p.sessions) : "" });
                    }}
                    className={`${CELL} ${OK_B} cursor-pointer appearance-none`}
                  >
                    <option value="">상품 없음</option>
                    {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input value={r.remaining} onChange={(e) => patch(r.key, { remaining: e.target.value.replace(/\D/g, "") })} disabled={!r.productId} inputMode="numeric" placeholder={prod ? String(prod.sessions) : "—"} className={`${CELL} text-center ${b("remaining")}`} />
                  <div>
                    {/* 키보드 숫자 입력 + 우측 달력 아이콘(브라우저 캘린더) — 네이티브 date input */}
                    <input type="date" value={r.startDate} onChange={(e) => patch(r.key, { startDate: e.target.value })} disabled={!r.productId} className={`${CELL} ${b("startDate")}`} />
                    {end ? <div className="mt-[3px] pl-1 text-[10.5px] font-semibold text-sage-deep">만료 {end.slice(2).replace(/-/g, ".")}</div> : null}
                  </div>
                  <SlotsCell value={r.slots} onChange={(slots) => patch(r.key, { slots })} />
                  <select value={r.trainerId} onChange={(e) => patch(r.key, { trainerId: e.target.value })} className={`${CELL} ${OK_B} cursor-pointer appearance-none`}>
                    {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <button type="button" onClick={() => removeRow(r.key)} aria-label="행 삭제" className="mt-[9px] flex h-5 w-5 items-center justify-center justify-self-center rounded-full text-[#C2BAAD] transition hover:bg-[#F4EFE6] hover:text-terracotta">
                    <Icon name="close" size={12} />
                  </button>
                </div>
              );
            })}
          </div>

          <button type="button" onClick={() => setRows((prev) => [...prev, fresh()])} className="mt-2.5 inline-flex items-center gap-1.5 rounded-[10px] px-2 py-1.5 text-[12.5px] font-semibold text-sage-deep transition hover:bg-[#F4F0E8]">
            <Icon name="plus" size={14} /> 행 추가
          </button>

          {err ? <div className="mt-2 text-[12.5px] font-semibold text-terracotta">{err}</div> : null}
        </div>
      )}
    </ConsoleModal>
  );
}

/* ----- 수업 일정 셀: 칩 + 팝오버(요일 다중선택 → 시각 → 추가) ----- */
function SlotsCell({ value, onChange }: { value: CarrySlot[]; onChange: (v: CarrySlot[]) => void }) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<number[]>([]);
  const [hour, setHour] = useState(19);
  const [minute, setMinute] = useState<0 | 30>(0);

  function add() {
    if (days.length === 0) return;
    const merged = [...value];
    for (const weekday of days) {
      if (!merged.some((s) => s.weekday === weekday && s.hour === hour && s.minute === minute)) {
        merged.push({ weekday, hour, minute });
      }
    }
    onChange(merged.sort(slotSort));
    setDays([]); // 요일만 리셋 — 같은 시각으로 연속 추가 가능
  }
  function remove(s: CarrySlot) {
    onChange(value.filter((v) => !(v.weekday === s.weekday && v.hour === s.hour && v.minute === s.minute)));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${CELL} ${OK_B} flex min-h-[36px] cursor-pointer flex-wrap items-center gap-1 text-left`}
      >
        {value.length === 0 ? (
          <span className="text-[#B3AA9C]">일정 추가</span>
        ) : (
          value.map((s) => (
            <span key={`${s.weekday}-${s.hour}-${s.minute}`} className="inline-flex items-center gap-1 rounded-[7px] bg-[#EDF4E3] px-1.5 py-0.5 text-[11.5px] font-bold text-[#5B6452]">
              {slotLabel(s)}
              <span
                role="button"
                aria-label={`${slotLabel(s)} 삭제`}
                onClick={(e) => { e.stopPropagation(); remove(s); }}
                className="text-[#9AAF8B] hover:text-terracotta"
              >
                <Icon name="close" size={9} />
              </span>
            </span>
          ))
        )}
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-[80]" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-[calc(100%+4px)] z-[81] w-[290px] rounded-[14px] border border-ink/[0.08] bg-white p-3.5" style={{ boxShadow: "0 16px 40px -12px rgba(38,35,30,0.35)" }}>
            <div className="mb-2 text-[11px] font-semibold text-[#9A917F]">요일 선택</div>
            <div className="mb-3 flex gap-1">
              {WD_ORDER.map((w) => {
                const on = days.includes(w);
                return (
                  <button key={w} type="button" onClick={() => setDays(on ? days.filter((d) => d !== w) : [...days, w])} className={`h-8 w-8 rounded-[9px] text-[12.5px] font-bold transition ${on ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"} ${w === 0 ? "text-sunday" : ""} ${on && w === 0 ? "text-white" : ""}`}>
                    {WD_KO[w]}
                  </button>
                );
              })}
            </div>
            <div className="mb-2 text-[11px] font-semibold text-[#9A917F]">시각</div>
            <div className="mb-3 flex items-center gap-1.5">
              <select value={hour} onChange={(e) => setHour(Number(e.target.value))} className={`${CELL} ${OK_B} w-[84px] cursor-pointer appearance-none text-center`}>
                {HOURS.map((h) => <option key={h} value={h}>{h}시</option>)}
              </select>
              {([0, 30] as const).map((m) => (
                <button key={m} type="button" onClick={() => setMinute(m)} className={`flex-1 rounded-[10px] py-[8px] text-[12.5px] font-semibold transition ${minute === m ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] text-[#766D60]"}`}>
                  {m === 0 ? "정각" : "30분"}
                </button>
              ))}
            </div>
            <div className="flex gap-1.5">
              <button type="button" onClick={add} disabled={days.length === 0} className="flex-1 rounded-[10px] bg-sage py-[9px] text-[12.5px] font-semibold text-white transition hover:brightness-[1.06] disabled:opacity-40">
                {days.length > 0 ? `${days.map((w) => WD_KO[w]).join("·")} ${hour}:${minute === 30 ? "30" : "00"} 추가` : "요일을 선택하세요"}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="rounded-[10px] border border-[rgba(75,59,46,0.14)] bg-white px-3 text-[12.5px] font-semibold text-[#766D60] transition hover:bg-[#F4F0E8]">
                완료
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
