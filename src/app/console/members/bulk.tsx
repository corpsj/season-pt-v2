// client-only(부모 ui.tsx가 "use client" 경계) — 직접 서버 컴포넌트에서 import하지 말 것.
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { OBtn, PBtn, ConsoleModal } from "@/components/console/ui";
import { bulkAddMembers } from "@/lib/data/groups/carryover-actions";
import { parseEndDate, type CarrySlot } from "@/lib/import/carryover-parse";
import type { Gender, MembershipProduct } from "@/lib/types";
import { formatPhone } from "@/components/ui/Field";

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
  teamKey: number | null; // 같은 값의 인접 두 행 = 2:1 팀 쌍(팀 일정·담당은 위 행 기준)
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
const DRAFT_KEY = "spt.bulk-add.draft"; // 세션 초안 저장 키(탭 세션 한정 → 오래된 초안 자연 소멸)

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
    teamKey: null,
  });
  const [rows, setRows] = useState<Draft[]>(() => Array.from({ length: 5 }, fresh));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; failed: { name: string; error: string }[] } | null>(null);
  const [restored, setRestored] = useState(false);

  // 세션 초안 복원 — 실수로 닫거나 새로고침해도 입력이 남게. 마운트 후에만 읽어 하이드레이션 불일치 방지.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Draft[];
      if (Array.isArray(saved) && saved.some((r) => !isEmpty(r))) {
        keySeq = Math.max(0, ...saved.map((r) => r.key)) + 1; // 이후 새 행 key 충돌 방지
        setRows(saved);
        setRestored(true);
      }
    } catch { /* 손상된 초안은 무시 */ }
  }, []);

  // 입력이 있을 때만 저장(빈 폼은 저장 안 함). 등록 완료(result) 후엔 저장 중단.
  useEffect(() => {
    if (result) return;
    if (!rows.some((r) => !isEmpty(r))) return;
    try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify(rows)); } catch { /* 저장 불가 브라우저 무시 */ }
  }, [rows, result]);

  function clearDraft() {
    keySeq = 0;
    setRows(Array.from({ length: 5 }, fresh));
    setRestored(false);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* noop */ }
  }

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
      const gone = prev.find((r) => r.key === key);
      const next = prev
        .filter((r) => r.key !== key)
        .map((r) => (gone?.teamKey != null && r.teamKey === gone.teamKey ? { ...r, teamKey: null } : r)); // 짝 해제
      return next.length ? next : [fresh()];
    });
  }

  /* ----- 2:1 팀 쌍 — 인접 두 행을 같은 teamKey로 묶는다 ----- */
  function linkRows(a: Draft, b: Draft) {
    setRows((prev) => prev.map((r) => (r.key === a.key || r.key === b.key ? { ...r, teamKey: a.key } : r)));
  }
  function unlinkTeam(teamKey: number) {
    setRows((prev) => prev.map((r) => (r.teamKey === teamKey ? { ...r, teamKey: null } : r)));
  }
  const pairPartner = (r: Draft) =>
    r.teamKey == null ? undefined : rows.find((o) => o.key !== r.key && o.teamKey === r.teamKey);
  /** 팀 행 자체 오류: 짝이 없거나 비었거나, 첫 행(팀 일정 담당 행)에 일정이 없음. */
  function teamErr(r: Draft): boolean {
    if (r.teamKey == null) return false;
    const p = pairPartner(r);
    if (!p || isEmpty(p)) return true;
    const isFirst = rows.findIndex((o) => o.teamKey === r.teamKey) === rows.findIndex((o) => o.key === r.key);
    return isFirst && r.slots.length === 0;
  }

  const filled = rows.filter((r) => !isEmpty(r));
  const errCount = filled.filter((r) => rowErrors(r, products).size > 0 || teamErr(r)).length;
  const validCount = filled.length - errCount;

  async function submit() {
    if (busy || validCount === 0 || errCount > 0) return;
    setBusy(true);
    setErr(null);
    const res = await bulkAddMembers(
      filled.map((r) => {
        // 팀 쌍의 둘째 행: 일정·담당은 첫 행 기준(개인 1:1 스케줄이 따로 생기지 않게 slots는 비운다).
        const p = pairPartner(r);
        const isSecond = !!p && rows.findIndex((o) => o.key === p.key) < rows.findIndex((o) => o.key === r.key);
        return {
          name: r.name, phone: r.phone, birth: r.birth.replace(/\D/g, ""), gender: r.gender,
          productId: r.productId || null,
          remaining: r.productId ? Number(r.remaining) : null,
          startDate: r.productId ? r.startDate : null,
          slots: isSecond ? [] : r.slots,
          trainerId: (isSecond ? p!.trainerId : r.trainerId) || null,
          teamKey: r.teamKey,
        };
      }),
    );
    setBusy(false);
    if (!res.ok && res.created === 0 && res.failed.length === 0) {
      setErr(res.error ?? "등록에 실패했어요");
      return;
    }
    setResult({ created: res.created, failed: res.failed });
    try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } // 등록 성공 → 초안 소멸
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
            <PBtn icon="check-bold" pending={busy} disabled={validCount === 0 || errCount > 0} onClick={submit}>
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
          {restored ? (
            <div className="mb-3 flex items-center gap-2 rounded-[13px] bg-[#EDF4E3] px-4 py-2.5 text-[12px] font-semibold text-[#5B6452]">
              <Icon name="clock" size={15} className="flex-none text-sage-deep" />
              임시저장된 입력을 불러왔어요
              <button type="button" onClick={clearDraft} className="ml-auto rounded-[8px] px-2.5 py-1 text-[11.5px] font-semibold text-[#9A917F] transition hover:bg-white hover:text-terracotta">
                비우기
              </button>
            </div>
          ) : null}
          <div className="mb-3.5 flex items-start gap-2.5 rounded-[13px] bg-[#F8F4EC] px-4 py-3">
            <Icon name="circle-info" size={16} className="mt-px flex-none text-[#A89F92]" />
            <span className="text-[12px] font-medium leading-relaxed text-[#766D60]">
              상품을 고르면 <b className="font-semibold text-[#5B5345]">등록일 + 상품 유효기간</b>으로 만료일이 자동 계산돼요.
              잔여횟수는 기존 회원 이관 시 남은 횟수로 고쳐주세요. 결제는 기록되지 않아 매출에 잡히지 않아요 — 신규 결제는 등록 후 결제 화면에서 기록해주세요.
              <b className="font-semibold text-[#5B5345]"> 2:1 팀</b>은 두 회원을 위·아래 행에 입력한 뒤 행 왼쪽의 <b className="font-semibold text-[#5B5345]">[2:1]</b> 버튼을 누르세요 — 팀 일정·담당은 위 행 기준이에요.
            </span>
          </div>

          {/* header — 좌측 거터(팀 묶기/해제 레일) 폭만큼 밀어 컬럼 정렬 */}
          <div className="sticky top-0 z-10 -mx-1 flex gap-x-1.5 rounded-[8px] bg-white px-1 pb-1.5 pt-1">
            <div className="w-7 shrink-0" />
            <div className={`${COLS} min-w-0 flex-1 text-[11px] font-semibold tracking-[0.02em] text-[#9A917F]`}>
              <span>이름</span><span>연락처</span><span>생년월일</span><span>성별</span><span>상품</span><span>잔여</span><span>등록일</span><span>수업 일정</span><span>담당강사</span><span />
            </div>
          </div>

          <div className="flex flex-col gap-[7px]">
            {(() => {
              // 인접한 같은 teamKey 두 행 = 한 팀 유닛으로 묶어 렌더
              const units: Draft[][] = [];
              for (let i = 0; i < rows.length; i++) {
                const r = rows[i];
                const nx = rows[i + 1];
                if (r.teamKey != null && nx && nx.teamKey === r.teamKey) {
                  units.push([r, nx]);
                  i++;
                } else units.push([r]);
              }
              const renderRow = (r: Draft, pairFirst?: Draft) => {
                const empty = isEmpty(r);
                const errs = empty ? new Set<Field>() : rowErrors(r, products);
                const prod = products.find((p) => p.id === r.productId);
                const end = prod && r.startDate ? addDays(r.startDate, prod.durationDays) : null;
                const b = (f: Field) => (errs.has(f) ? ERR_B : OK_B);
                // 팀 첫 행인데 팀 일정이 비어 있으면 일정 셀에 오류 표시
                const slotsErr = !pairFirst && r.teamKey != null && !empty && r.slots.length === 0;
                return (
                  <div key={r.key} className={COLS}>
                    <input value={r.name} onChange={(e) => patch(r.key, { name: e.target.value })} placeholder="이름" className={`${CELL} ${b("name")}`} />
                    <input value={formatPhone(r.phone)} onChange={(e) => patch(r.key, { phone: e.target.value.replace(/\D/g, "").slice(0, 11) })} placeholder="010-0000-0000" inputMode="tel" className={`${CELL} ${b("phone")}`} />
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
                      <DateCell value={r.startDate} onChange={(iso) => patch(r.key, { startDate: iso })} disabled={!r.productId} error={errs.has("startDate")} />
                      {end ? <div className="mt-[3px] pl-1 text-[10.5px] font-semibold text-sage-deep">만료 {end.slice(2).replace(/-/g, ".")}</div> : null}
                    </div>
                    {pairFirst ? (
                      <div className={`${CELL} ${OK_B} flex min-h-[36px] items-center bg-[#F4F0E8] text-[12px] font-semibold text-[#9A917F]`}>팀 일정 = 위 행</div>
                    ) : (
                      <SlotsCell value={r.slots} onChange={(slots) => patch(r.key, { slots })} error={slotsErr} />
                    )}
                    <select
                      value={pairFirst ? pairFirst.trainerId : r.trainerId}
                      disabled={!!pairFirst}
                      onChange={(e) => patch(r.key, { trainerId: e.target.value })}
                      className={`${CELL} ${OK_B} cursor-pointer appearance-none`}
                    >
                      {trainers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button type="button" onClick={() => removeRow(r.key)} aria-label="행 삭제" className="mt-[9px] flex h-5 w-5 items-center justify-center justify-self-center rounded-full text-[#C2BAAD] transition hover:bg-[#F4EFE6] hover:text-terracotta">
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                );
              };
              return units.map((u) => {
                if (u.length === 2) {
                  // 팀 유닛: 좌측 레일에 2:1 배지·해제, 두 행은 바로 붙여 압축. (중간 설명 행 제거 —
                  // '담당·일정은 위 행 기준'은 둘째 행의 '팀 일정 = 위 행' 셀·비활성 담당셀이 이미 보여줌)
                  return (
                    <div key={`team-${u[0].key}`} className="flex gap-x-1.5 rounded-[12px] bg-[#F3F7EC] p-[5px] pl-[3px] ring-1 ring-sage/40">
                      <div className="flex w-7 shrink-0 flex-col items-center justify-center gap-1.5">
                        <span className="rounded-[6px] bg-sage px-1 py-[3px] text-[10px] font-bold leading-none text-white" title="2:1 팀">2:1</span>
                        <button type="button" onClick={() => unlinkTeam(u[0].teamKey!)} title="2:1 팀 해제" aria-label="2:1 팀 해제" className="flex h-5 w-5 items-center justify-center rounded-full text-[#9A917F] transition hover:bg-white hover:text-terracotta">
                          <Icon name="close" size={12} />
                        </button>
                      </div>
                      <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
                        {renderRow(u[0])}
                        {renderRow(u[1], u[0])}
                      </div>
                    </div>
                  );
                }
                const r = u[0];
                const idx = rows.findIndex((o) => o.key === r.key);
                const nx = rows[idx + 1];
                const canLink = nx && !isEmpty(r) && !isEmpty(nx) && r.teamKey == null && nx.teamKey == null;
                return (
                  // 묶기 버튼은 좌측 고정 거터에 항상 노출(발견성 확보) — 세로 공간은 차지하지 않음.
                  <div key={r.key} className="flex items-start gap-x-1.5">
                    <div className="flex w-7 shrink-0 justify-center pt-[6px]">
                      {canLink ? (
                        <button
                          type="button"
                          onClick={() => linkRows(r, nx)}
                          title="아래 행과 2:1 팀으로 묶기"
                          aria-label="아래 행과 2:1 팀으로 묶기"
                          className="rounded-[7px] border border-dashed border-[rgba(138,111,62,0.5)] bg-[#FBF7EF] px-[5px] py-[3px] text-[10px] font-bold leading-none text-[#8A6F3E] shadow-sm transition hover:border-solid hover:bg-[#F6EFE2] hover:text-[#7A6338]"
                        >
                          2:1
                        </button>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">{renderRow(r)}</div>
                  </div>
                );
              });
            })()}
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

function formatDateDigits(digits: string): string {
  if (digits.length <= 4) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
}

/** 등록일 셀: 구분자 없이 "20260606"처럼 이어 쳐도 8자리 채우면 자동으로 날짜 확정. 우측 아이콘은 네이티브 달력 호출. */
function DateCell({
  value,
  onChange,
  disabled,
  error,
}: {
  value: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  error?: boolean;
}) {
  const [text, setText] = useState(value);
  const pickerRef = useRef<HTMLInputElement>(null);

  function handleType(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 8);
    setText(formatDateDigits(digits));
    if (digits.length === 8) {
      const iso = parseEndDate(digits);
      if (iso) onChange(iso);
    }
  }
  function openPicker() {
    const el = pickerRef.current;
    if (!el) return;
    try {
      if (typeof el.showPicker === "function") el.showPicker();
      else el.click();
    } catch { /* 지원 안 하는 브라우저 — 아이콘은 무반응, 타이핑 입력은 그대로 동작 */ }
  }

  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => handleType(e.target.value)}
        disabled={disabled}
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        maxLength={10}
        className={`${CELL} ${error ? ERR_B : OK_B} pr-8`}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        aria-label="달력에서 선택"
        className="absolute right-[5px] top-1/2 flex h-[22px] w-[22px] -translate-y-1/2 items-center justify-center rounded-[6px] text-[#9A917F] transition hover:bg-[#F4EFE6] hover:text-sage-deep disabled:opacity-30"
      >
        <Icon name="calendar" size={13} />
      </button>
      {/* 화면엔 안 보이지만 아이콘 클릭 시 showPicker()로 여는 네이티브 date input — 실제 값 소스는 위 텍스트 필드 */}
      <input
        ref={pickerRef}
        type="date"
        value={value}
        onChange={(e) => { setText(e.target.value); onChange(e.target.value); }}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-0"
      />
    </div>
  );
}

/* ----- 수업 일정 셀: 칩 + 팝오버(요일 다중선택 → 요일마다 시각 → 추가) ----- */
function SlotsCell({ value, onChange, error }: { value: CarrySlot[]; onChange: (v: CarrySlot[]) => void; error?: boolean }) {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<CarrySlot[]>([]);
  // 새로 고른 요일이 물려받을 직전 시각(요일별로 다르게 바꿔도, 다음 요일 기본값은 마지막 설정값).
  const [lastTime, setLastTime] = useState<{ hour: number; minute: 0 | 30 }>({ hour: 19, minute: 0 });

  function toggleDay(weekday: number) {
    setPicks((prev) =>
      prev.some((p) => p.weekday === weekday)
        ? prev.filter((p) => p.weekday !== weekday)
        : [...prev, { weekday, ...lastTime }].sort(slotSort),
    );
  }
  function setPickTime(weekday: number, part: { hour?: number; minute?: 0 | 30 }) {
    setPicks((prev) => prev.map((p) => (p.weekday === weekday ? { ...p, ...part } : p)));
    setLastTime((lt) => ({ ...lt, ...part }));
  }

  function add() {
    if (picks.length === 0) return;
    const merged = [...value];
    for (const p of picks) {
      if (!merged.some((s) => s.weekday === p.weekday && s.hour === p.hour && s.minute === p.minute)) {
        merged.push(p);
      }
    }
    onChange(merged.sort(slotSort));
    setPicks([]); // 요일만 리셋 — 연속 추가 가능
  }
  function remove(s: CarrySlot) {
    onChange(value.filter((v) => !(v.weekday === s.weekday && v.hour === s.hour && v.minute === s.minute)));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${CELL} ${error ? ERR_B : OK_B} flex min-h-[36px] cursor-pointer flex-wrap items-center gap-1 text-left`}
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
          <div className="absolute left-0 top-[calc(100%+4px)] z-[81] w-[310px] rounded-[14px] border border-ink/[0.08] bg-white p-3.5" style={{ boxShadow: "0 16px 40px -12px rgba(38,35,30,0.35)" }}>
            <div className="mb-2 text-[11px] font-semibold text-[#9A917F]">요일 선택</div>
            <div className="mb-3 flex gap-1">
              {WD_ORDER.map((w) => {
                const on = picks.some((p) => p.weekday === w);
                return (
                  <button key={w} type="button" onClick={() => toggleDay(w)} className={`h-8 w-8 rounded-[9px] text-[12.5px] font-bold transition ${on ? "bg-sage text-white" : "bg-[#F4F0E8] text-[#766D60] hover:bg-[#ECE6DA]"} ${w === 0 && !on ? "text-sunday" : ""}`}>
                    {WD_KO[w]}
                  </button>
                );
              })}
            </div>
            {picks.length > 0 ? (
              <>
                <div className="mb-2 text-[11px] font-semibold text-[#9A917F]">요일별 시각</div>
                <div className="mb-3 flex flex-col gap-1.5">
                  {picks.map((p) => (
                    <div key={p.weekday} className="flex items-center gap-1.5">
                      <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] bg-sage text-[12.5px] font-bold text-white">{WD_KO[p.weekday]}</span>
                      <select value={p.hour} onChange={(e) => setPickTime(p.weekday, { hour: Number(e.target.value) })} className={`flex-1 cursor-pointer appearance-none rounded-[10px] border bg-[#FBF9F5] py-[8px] text-center text-[13px] font-medium text-ink outline-none focus-visible:ring-2 focus-visible:ring-sage/40 ${OK_B}`}>
                        {HOURS.map((h) => <option key={h} value={h}>{h}시</option>)}
                      </select>
                      {([0, 30] as const).map((m) => (
                        <button key={m} type="button" onClick={() => setPickTime(p.weekday, { minute: m })} className={`w-[46px] flex-none rounded-[10px] py-[8px] text-[12px] font-semibold transition ${p.minute === m ? "bg-sage text-white" : "border border-[rgba(75,59,46,0.14)] bg-[#FBF9F5] text-[#766D60]"}`}>
                          {m === 0 ? "정각" : ":30"}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            <div className="flex gap-1.5">
              <button type="button" onClick={add} disabled={picks.length === 0} className="flex-1 rounded-[10px] bg-sage py-[9px] text-[12.5px] font-semibold text-white transition hover:brightness-[1.06] disabled:opacity-40">
                {picks.length > 0 ? `${picks.map((p) => WD_KO[p.weekday]).join("·")} 추가` : "요일을 선택하세요"}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="rounded-[10px] border border-[rgba(75,59,46,0.14)] bg-white px-3 text-[12.5px] font-semibold text-[#766D60] transition hover:bg-[#F4F0E8]">
                완료
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
