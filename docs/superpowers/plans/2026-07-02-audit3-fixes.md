# 3차 실사용 감사 백로그 수정 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3차 실사용 감사 확정 백로그(스펙 `docs/superpowers/specs/2026-07-02-audit3-fixes-design.md`)의 웹푸시 제외 전 항목을 4페이즈로 수정한다.

**Architecture:** Next.js(App Router) + Supabase 서비스롤 데이터 레이어(`src/lib/data/groups/*` 서버 액션 + 게터). 기존 `Result{ok,error}` + 토스트 패턴, `ConfirmDialog`/`Field`/`MiniButton` 등 기존 UI 프리미티브만 재사용. 신규 마이그레이션 1개(0018).

**Tech Stack:** Bun, TypeScript, Next.js, Supabase(JS admin client), Tailwind. 테스트는 `bun test`(순수 계산만), 나머지는 `bunx tsc --noEmit` + 수동 검증.

## Global Constraints

- 회원 비밀번호는 **생년월일 6자리 고정** — 변경 기능은 제거한다(스펙 확정 결정).
- **차감용 `activeMembership`(`src/lib/data/groups/scheduling-actions.ts`, `.eq("status","active").gt("remaining_sessions",0)`)은 절대 수정 금지** — 감사 C2 수정 유지. 이번에 넓히는 것은 `src/lib/data/groups/member.ts`의 표시용 `activeMembership`뿐.
- 모든 서버 액션은 기존 관례를 따른다: `"use server"`, `Result{ok,error}` 반환, 소유권/역할 가드 선행, insert/update 에러를 삼키지 않음.
- 에러 문구는 한국어 존댓말("~해주세요", "~했어요"), 회원 대상 문구에서 강사는 "선생님".
- 스펙 항목 13(알림설정 라벨)은 **이미 구현돼 있음**(`src/app/(app)/t/settings/notifications/ui.tsx`의 ROWS가 감사 H13으로 수정 완료) — 이 계획에서 제외.
- 커밋 메시지 끝: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 각 태스크 완료 시 `bunx tsc --noEmit` 통과 후 커밋. 배포는 전체 완료 후(Task 18).

---

## Phase 1 · 계정/비밀번호

### Task 1: 회원 비밀번호 변경 기능 제거

**Files:**
- Modify: `src/lib/auth/member-actions.ts` (changeMemberPassword 삭제)
- Modify: `src/app/(app)/m/my/ui.tsx` (변경 메뉴/모달 제거)

**Interfaces:**
- Consumes: 없음
- Produces: `changeMemberPassword` 심볼이 코드베이스에서 사라짐 (Task 2가 이 전제 위에서 비번을 생일과 동기화)

- [ ] **Step 1: 액션 삭제**

`src/lib/auth/member-actions.ts`에서 `changeMemberPassword` 함수 전체(주석 `/** 회원 비밀번호 변경...` 부터 함수 끝까지)를 삭제한다. `hashPassword` import가 다른 곳에서 안 쓰이면 import에서도 제거(`verifyPassword`는 로그인에 필요하므로 유지).

- [ ] **Step 2: UI 제거**

`src/app/(app)/m/my/ui.tsx`에서:
- `import { memberLogout, changeMemberPassword }` → `import { memberLogout }`
- `<MenuRow icon="lock" label="비밀번호 변경" onClick={() => setPwOpen(true)} first />` 행 삭제. 이 행이 `first`였으므로 바로 아래 MenuRow에 `first`를 옮긴다(있다면).
- 비밀번호 변경 모달 블록(`비밀번호 변경` 타이틀 ~ 모달 닫는 태그)과 관련 state(`pwOpen`, `cur`, `next`, 변경 핸들러) 전부 삭제.

- [ ] **Step 3: 잔여 참조 0 확인**

```bash
grep -rn "changeMemberPassword\|pwOpen" src/
```
Expected: no matches

- [ ] **Step 4: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(auth): 회원 비밀번호 변경 기능 제거 — 생년월일 고정 정책(감사3 #2/#3)"
```

### Task 2: 생년월일 수정 = 비밀번호 초기화 + 잠금 해제

**Files:**
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (`updateMember`)
- Modify: `src/app/(app)/t/members/[id]/EditMemberButton.tsx`

**Interfaces:**
- Consumes: `hashPassword`(`@/lib/auth/password`), `parseBirth6`(`@/lib/data/db`, membership-actions.ts에서 사용례 확인 가능)
- Produces: `updateMember(id, { name, phone, gender, injuryNote?, birth? })` — `birth`는 선택(6자리 YYMMDD 문자열). 빈 값이면 생일·비번 불변.

- [ ] **Step 1: updateMember 확장**

`src/lib/data/groups/owner-ops-actions.ts`의 `updateMember`를 다음으로 교체 (import에 `parseBirth6`가 이미 db import 줄에 있는지 확인, 없으면 추가; `hashPassword`는 `@/lib/auth/password`에서, `createSupabaseAdmin`은 이 파일에서 미사용이면 `member_login_attempts`는 `sb`로 접근):

```ts
/** 회원 정보 수정(이름·연락처·성별·부상메모·생년월일). 대표 전용. 연락처는 정규화 후 중복 시 거부.
 *  생년월일을 바꾸면 비밀번호(=생년월일 6자리)도 재설정하고 로그인 잠금을 해제한다 — 비번 분실 복구 수단 겸용. */
export async function updateMember(
  id: string,
  input: { name: string; phone: string; gender: Gender; injuryNote?: string; birth?: string },
): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  if (t.role !== "owner") return { ok: false, error: OWNER_ONLY_ERROR };

  const name = input.name.trim();
  const phone = normPhone(input.phone);
  if (!name) return { ok: false, error: "이름을 입력해주세요" };
  if (!phone) return { ok: false, error: "연락처를 입력해주세요" };

  const patch: Record<string, unknown> = { name, phone, gender: input.gender, injury_note: input.injuryNote?.trim() || null };
  const birth6 = input.birth?.replace(/\D/g, "") ?? "";
  if (birth6) {
    const birthdate = parseBirth6(birth6);
    if (!birthdate) return { ok: false, error: "생년월일을 올바른 6자리(YYMMDD) 날짜로 입력해주세요" };
    patch.birthdate = birthdate;
    patch.password_hash = hashPassword(birth6); // 비번=생년월일 고정 정책
  }

  const { error } = await sb.from("members").update(patch).eq("id", id);
  if (error) return { ok: false, error: "이미 사용 중인 연락처이거나 수정에 실패했어요" };
  if (birth6) await sb.from("member_login_attempts").delete().eq("phone", phone); // 잠금 해제(best-effort)

  revalidatePath(`/t/members/${id}`);
  revalidatePath("/t/members");
  return { ok: true };
}
```

파일 상단 import에 `hashPassword`가 이미 있는지 확인(`membership-actions.ts`처럼 `import { hashPassword } from "@/lib/auth/password";`) — createMember가 이미 쓰고 있으면 그대로.

- [ ] **Step 2: EditMemberButton에 생년월일 필드 추가**

`EditMemberButton.tsx` state에 `birth: ""` 추가(`useState({ name, phone, gender: ..., injury: injury ?? "", birth: "" })`), `save()`의 호출을 `updateMember(id, { name: f.name, phone: f.phone, gender: f.gender, injuryNote: f.injury, birth: f.birth })`로. 부상 메모 Field 위에 추가:

```tsx
<Field icon="cake" label="생년월일 변경 (선택)">
  <TextInput
    value={f.birth}
    onChange={(e) => setF({ ...f, birth: e.target.value })}
    inputMode="numeric"
    maxLength={6}
    placeholder="변경할 때만 입력 (예: 900325)"
  />
</Field>
<p className="text-[11.5px] text-muted">생년월일을 바꾸면 로그인 비밀번호도 새 생년월일 6자리로 초기화돼요.</p>
```

`icon="cake"`가 아이콘 셋에 없으면 `icon="person"` 재사용(`src/components/ui/icon` 확인).

- [ ] **Step 3: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(member): 생년월일 수정 시 비밀번호 재설정+잠금 해제 — 대표측 비번 초기화 수단(감사3 #3)"
```

### Task 3: 강사 비밀번호 리셋 (대표 전용)

**Files:**
- Modify: `src/lib/auth/trainer-actions.ts` (액션 추가)
- Modify: `src/app/(app)/t/staff/[id]/ui.tsx` (버튼 + 임시비번 표시)
- Modify: `src/app/console/trainers/ui.tsx` (동일 버튼)

**Interfaces:**
- Consumes: `fetchTrainer`, `ensureOwner`, ALPHANUM 임시비번 패턴(inviteInstructor와 동일)
- Produces: `resetInstructorPassword(id: string): Promise<Result & { tempPassword?: string }>`

- [ ] **Step 1: 액션 추가**

`src/lib/auth/trainer-actions.ts` 끝(강사 관리 섹션)에 추가:

```ts
/** 강사 비밀번호 초기화. 대표 전용. 임시비밀번호를 발급하고 첫 로그인 시 변경을 강제한다. */
export async function resetInstructorPassword(id: string): Promise<Result & { tempPassword?: string }> {
  const me = await ensureOwner();
  if (!me) return { ok: false, error: OWNER_ONLY_ERROR };
  const admin = createSupabaseAdmin();
  const target = await fetchTrainer(admin, id);
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정은 초기화할 수 없어요. scripts/reset-trainer-password.ts를 사용하세요." };
  if (!target.auth_user_id) return { ok: false, error: "로그인 계정이 없는 강사예요" };
  // inviteInstructor와 동일한 CSPRNG 임시비번(혼동 문자 제외 8자리)
  const ALPHANUM = "abcdefghjkmnpqrstuvwxyz23456789";
  const tempPassword = Array.from({ length: 8 }, () => ALPHANUM[randomInt(ALPHANUM.length)]).join("");
  const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: tempPassword });
  if (error) return { ok: false, error: "초기화에 실패했어요. 다시 시도해주세요." };
  await admin.from("trainers").update({ must_change_password: true }).eq("id", id);
  return { ok: true, tempPassword };
}
```

- [ ] **Step 2: /t/staff/[id] 버튼**

`StaffDetailClient`에 state `const [tempPw, setTempPw] = useState<string | null>(null);`와 핸들러:

```tsx
async function onResetPassword() {
  if (busy) return;
  if (!confirm(`${member.name} 강사의 비밀번호를 초기화할까요? 임시 비밀번호가 발급돼요.`)) return;
  setBusy(true);
  const r = await resetInstructorPassword(member.id);
  setBusy(false);
  if (!r.ok) return toast(r.error ?? "초기화에 실패했어요");
  setTempPw(r.tempPassword ?? null);
}
```

버튼은 활성/비활성 Switch 근처(관리 액션 영역)에 `<PrimaryButton>` 대신 기존 보조 버튼 스타일(`OutlineButton` 또는 파일 내 기존 보조 버튼 패턴)로 "비밀번호 초기화" 추가. 발급 결과는 버튼 아래에:

```tsx
{tempPw ? (
  <Banner tone="warn" className="mt-2.5">
    임시 비밀번호: <b className="select-all">{tempPw}</b> — 지금 강사에게 전달하세요. 첫 로그인 시 변경이 강제돼요.
  </Banner>
) : null}
```

import에 `resetInstructorPassword` 추가(`@/lib/auth/trainer-actions`).

- [ ] **Step 3: 콘솔 강사 패널 버튼**

`src/app/console/trainers/ui.tsx`를 읽고 강사별 액션 버튼(수정/비활성 등)이 있는 위치에 동일 패턴(`OBtn` + confirm + 결과 텍스트 표시)으로 "비번 초기화" 버튼 추가. 핸들러 로직은 Step 2와 동일(임시비번은 해당 강사 행 아래 or 토스트가 아닌 **화면에 잔류하는 텍스트**로 표시 — 토스트는 사라져서 전달 전에 유실됨).

- [ ] **Step 4: 타입체크 + 수동 확인 + 커밋**

```bash
bunx tsc --noEmit
```
수동: dev 서버에서 staff 상세 → 초기화 → 임시비번 표시 확인 → 해당 강사 계정 임시비번 로그인 → 변경 강제 화면 진입 확인.

```bash
git add -A && git commit -m "feat(auth): 강사 비밀번호 초기화(대표 전용, 임시비번+변경강제) (감사3 #4)"
```

### Task 4: 대표 계정 최후 복구 스크립트

**Files:**
- Create: `scripts/reset-trainer-password.ts`

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Bun이 `.env*` 자동 로드; `src/lib/supabase/admin.ts`가 쓰는 env 이름과 동일한지 먼저 확인하고 맞춘다)
- Produces: CLI `bun scripts/reset-trainer-password.ts <username> <new-password>`

- [ ] **Step 1: 스크립트 작성**

```ts
/**
 * 대표/강사 비밀번호 최후 복구 (앱 외부, service-role 필요).
 * 사용: bun scripts/reset-trainer-password.ts <username> <new-password>
 * 강사 인증 이메일이 가짜 도메인(@trainer.seasonpt.local)이라 이메일 리셋이 불가능하므로
 * 대표 계정 분실 시 이 스크립트가 유일한 복구 수단이다. .env.local(또는 .env.deploy.local)의
 * SUPABASE_SERVICE_ROLE_KEY를 사용한다 — 유출 금지.
 */
import { createClient } from "@supabase/supabase-js";

const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword || newPassword.length < 8) {
  console.error("사용법: bun scripts/reset-trainer-password.ts <username> <new-password(8자+)>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE env가 없어요 (.env.local 확인)"); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: tr, error } = await admin.from("trainers")
  .select("auth_user_id, display_name, role").eq("username", username.toLowerCase()).maybeSingle();
if (error || !tr?.auth_user_id) { console.error("해당 username의 계정을 찾을 수 없어요:", username); process.exit(1); }

const { error: upErr } = await admin.auth.admin.updateUserById(tr.auth_user_id, { password: newPassword });
if (upErr) { console.error("변경 실패:", upErr.message); process.exit(1); }
console.log(`완료: ${tr.display_name}(${tr.role}) 비밀번호를 변경했어요.`);
```

작성 전 `src/lib/supabase/admin.ts`를 열어 실제 env 변수명을 확인해 위 코드의 `url`/`key`를 맞춘다.

- [ ] **Step 2: 동작 확인 + 커밋**

로컬에서 테스트 계정으로 실행해 로그인 확인(프로덕션 계정 건드리지 않기):
```bash
bun scripts/reset-trainer-password.ts staff test5678   # 데모 강사로 확인 후
bun scripts/reset-trainer-password.ts staff test1234   # 원복
git add scripts/reset-trainer-password.ts && git commit -m "feat(ops): 대표 계정 최후 복구 스크립트 (감사3 #1)"
```

---

## Phase 2 · 환불

### Task 5: 마이그레이션 0018 (meta jsonb + payer 스냅샷)

**Files:**
- Create: `supabase/migrations/0018_refund_flex.sql`

**Interfaces:**
- Produces: `membership_events.meta jsonb`, `payments.payer_member_id uuid`(기존 행 백필 완료 상태)

- [ ] **Step 1: SQL 작성**

```sql
-- 감사3: 환불 유연화 + 결제자 스냅샷
-- 1) 환불 직전 상태 스냅샷/undo 표시용
alter table membership_events add column if not exists meta jsonb;

-- 2) 결제 당시의 결제자(양도 시 결제 내역이 인수자에게 넘어가던 문제)
alter table payments add column if not exists payer_member_id uuid references members(id) on delete set null;
update payments p set payer_member_id = m.member_id
  from memberships m
  where p.membership_id = m.id and p.payer_member_id is null;
create index if not exists idx_payments_payer on payments(payer_member_id);
```

- [ ] **Step 2: 적용 (Bun.SQL — psql 없음, 메모리 참조)**

기존 마이그레이션 적용 방식과 동일하게 `.env.deploy.local`의 `SUPABASE_DB_URL`로 적용(기존 적용 스크립트가 `scripts/`에 있으면 재사용, 없으면 일회성):

```bash
bun -e 'import { SQL } from "bun"; const sql = new SQL(process.env.SUPABASE_DB_URL!); await sql.file("supabase/migrations/0018_refund_flex.sql"); console.log("0018 applied");' 
```
(로컬 dev DB가 따로 없고 프로드 단일이므로 이 시점에 적용 — 컬럼 추가는 무중단.)

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0018_refund_flex.sql && git commit -m "feat(db): 0018 — membership_events.meta + payments.payer_member_id(백필) (감사3 #5)"
```

### Task 6: refundMembership 협의 금액 + 스냅샷 + 이관 0원 차단

**Files:**
- Modify: `src/lib/data/groups/membership-actions.ts` (`previewRefund`, `refundMembership`)

**Interfaces:**
- Consumes: Task 5의 `membership_events.meta`
- Produces:
  - `previewRefund(membershipId)` 반환에 `noBaseline: boolean` 추가(결제 합계 0 = 이관 회원권 등)
  - `refundMembership(input: { membershipId: string; method: PaymentMethod; amountOverride?: number; note?: string })` — `amountOverride` 미지정 시 산식 금액. refund 이벤트 `meta`에 `{ prev_status, prev_remaining, prev_end_date }` 저장.

- [ ] **Step 1: previewRefund에 noBaseline**

`previewRefund`의 return을:

```ts
const bal = await getMembershipBalance(membershipId);
return {
  ok: true, status: ms.status, noBaseline: bal.paid <= 0,
  ...computeRefund({ paidSum: bal.paid, totalSessions: ms.total_sessions, remainingSessions: ms.remaining_sessions, listUnitPrice: (ms.list_unit_price as number | null) ?? 0 }),
};
```

- [ ] **Step 2: refundMembership 확장**

시그니처와 본문을 다음 diff 요지로 수정(기존 원자 클레임·보상 로직 유지):

```ts
export async function refundMembership(input: {
  membershipId: string; method: PaymentMethod; amountOverride?: number; note?: string;
}): Promise<Result & { refund?: number }> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  const pre = await previewRefund(input.membershipId);
  if (!pre.ok) return { ok: false, error: pre.error };
  const { status: preStatus, refund: preRefund, used: preUsed, penalty: prePenalty, noBaseline } =
    pre as { ok: true; status: string; refund: number; used: number; deduction: number; penalty: number; noBaseline: boolean };
  if (preStatus === "refunded") return { ok: false, error: "이미 환불된 회원권이에요" };

  // 협의 금액: 미지정이면 산식 금액. 이관 회원권(기납부 0)은 자동 0원 확정을 막고 직접 입력을 요구(감사3 #7).
  if (input.amountOverride != null && (!Number.isInteger(input.amountOverride) || input.amountOverride < 0))
    return { ok: false, error: "환불 금액을 0 이상 정수로 입력해주세요" };
  if (noBaseline && input.amountOverride == null)
    return { ok: false, error: "결제 기록이 없는 회원권이에요. 환불 금액을 직접 입력해주세요." };
  const refundAmt = input.amountOverride ?? preRefund;

  const { data: msPre } = await sb.from("memberships")
    .select("status, remaining_sessions, end_date").eq("id", input.membershipId).maybeSingle();
  // ... (기존 원자 클레임 그대로) ...
```

이후 변경점:
- 음수 결제행: `amount: -refundAmt`, note는 `` input.note?.trim() || `환불: 사용 ${preUsed}회 정상가 차감 / 위약금 10%` `` (override 시 사용자가 사유를 남기게), `payer_member_id` 세팅(아래 Task 9에서 일괄 처리하므로 여기선 membership의 member_id를 조회해 넣는 코드까지 포함해도 됨 — 중복 조회를 피하려면 `refunded` 조회를 클레임 직후로 끌어올려 재사용).
- `refundAmt > 0`일 때만 음수 행 insert(기존 `preRefund > 0` 조건을 `refundAmt > 0`으로).
- 이벤트 insert에 meta 추가:

```ts
const { error: evErr } = await sb.from("membership_events").insert({
  membership_id: input.membershipId, type: "refund", amount: -refundAmt,
  note: `환불 ${refundAmt.toLocaleString()}원(사용 ${preUsed}회·위약금 ${prePenalty.toLocaleString()})${input.amountOverride != null ? " · 협의 금액" : ""}`,
  meta: { prev_status: msPre?.status ?? "active", prev_remaining: msPre?.remaining_sessions ?? 0, prev_end_date: msPre?.end_date ?? null },
  created_by: t.id,
});
```
- 최종 반환 `{ ok: true, refund: refundAmt }`.

- [ ] **Step 3: 테스트 + 커밋**

```bash
bun test src/lib/data/refund.test.ts   # 기존 순수 테스트 회귀 확인 (computeRefund 자체는 불변)
bunx tsc --noEmit
git add -A && git commit -m "feat(refund): 협의 금액(amountOverride)+사유, 이관 0원 자동확정 차단, 환불 전 상태 스냅샷 (감사3 #6·#7)"
```

### Task 7: undoRefund 액션 + 콘솔 매출 화면 버튼

**Files:**
- Modify: `src/lib/data/groups/membership-actions.ts` (undoRefund 추가)
- Modify: `src/app/console/revenue/ui.tsx` + 해당 게터(환불 행에 membershipId 노출 — 게터 파일은 `grep -rn "getRevenue" src/lib`로 확인)

**Interfaces:**
- Consumes: Task 6의 refund 이벤트 `meta` 스냅샷
- Produces: `undoRefund(membershipId: string): Promise<Result>` — 환불 취소(음수 결제행 삭제 + 회원권 복원 + 이벤트 `meta.undone=true`)

- [ ] **Step 1: 액션 추가**

`membership-actions.ts`에 추가:

```ts
/** 환불 취소: 오클릭·금액 오류 복구. 음수 결제행 삭제 + 환불 직전 상태로 복원(스냅샷). 대표 전용. */
export async function undoRefund(membershipId: string): Promise<Result> {
  const { t, err } = await requireOwner();
  if (!t) return { ok: false, error: err! };
  // 최신 refund 이벤트의 스냅샷 (undone 제외)
  const { data: ev } = await sb.from("membership_events")
    .select("id, meta").eq("membership_id", membershipId).eq("type", "refund")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  const meta = (ev?.meta ?? null) as { prev_status?: string; prev_remaining?: number; prev_end_date?: string; undone?: boolean } | null;
  if (!ev || !meta || meta.undone) return { ok: false, error: "취소할 환불 기록을 찾을 수 없어요" };
  // 원자 복원: refunded일 때만 전이(중복 취소 방지)
  const { data: claimed } = await sb.from("memberships")
    .update({ status: meta.prev_status ?? "active", remaining_sessions: meta.prev_remaining ?? 0, end_date: meta.prev_end_date ?? undefined })
    .eq("id", membershipId).eq("status", "refunded").select("id");
  if (!claimed || claimed.length === 0) return { ok: false, error: "환불 상태가 아니에요" };
  // 환불 음수 결제행 제거 — 실패 시 refunded로 되돌려 반쪽 상태 방지(refundMembership 보상 패턴과 대칭)
  const { error: delErr } = await sb.from("payments")
    .delete().eq("membership_id", membershipId).lt("amount", 0);
  if (delErr) {
    await sb.from("memberships").update({ status: "refunded", remaining_sessions: 0 }).eq("id", membershipId);
    return { ok: false, error: "환불 내역 삭제에 실패했어요. 다시 시도해주세요." };
  }
  await sb.from("membership_events").update({ meta: { ...meta, undone: true } }).eq("id", ev.id);
  await sb.from("membership_events").insert({ membership_id: membershipId, type: "refund", amount: 0, note: "환불 취소(복원)", meta: { undone: true, undo_of: ev.id }, created_by: t.id });
  revalidatePath("/t"); revalidatePath("/t/revenue"); revalidatePath("/t/members");
  return { ok: true }; // 정기 스케줄은 자동 재활성화하지 않음 — UI 토스트로 안내
}
```

- [ ] **Step 2: 콘솔 매출 화면에 버튼**

`getRevenue` 게터의 거래 행에 `membershipId`와 `isRefund`(amount<0)가 없으면 추가. `src/app/console/revenue/ui.tsx`의 거래 행 삭제 버튼 자리에서: 음수(환불) 행이면 삭제 버튼 대신 "환불 취소" 버튼을 렌더:

```tsx
{row.isRefund && row.membershipId ? (
  <button onClick={() => onUndoRefund(row.membershipId!)} className={/* 기존 삭제 버튼과 동일 클래스 */}>환불 취소</button>
) : (/* 기존 삭제 버튼 */)}
```

핸들러:

```tsx
async function onUndoRefund(membershipId: string) {
  if (!confirm("이 환불을 취소하고 회원권을 복원할까요?")) return;
  const r = await undoRefund(membershipId);
  toast(r.ok ? "환불을 취소했어요. 정기 수업이 있었다면 스케줄을 다시 켜주세요." : (r.error ?? "취소에 실패했어요"));
  if (r.ok) router.refresh();
}
```

- [ ] **Step 3: 수동 왕복 검증 + 커밋**

dev에서: 테스트 회원 환불(협의 금액) → 매출에 음수 행 → 환불 취소 → 회원권 active·잔여 복원, 음수 행 소멸 확인.

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(refund): 환불 취소(undoRefund) — 스냅샷 복원 + 콘솔 매출 화면 버튼 (감사3 #8)"
```

### Task 8: 환불 UI — 금액 입력(콘솔·모바일) + 미리보기 실패 분기

**Files:**
- Modify: `src/app/console/members/ui.tsx` (환불 모달)
- Modify: `src/app/(app)/t/members/[id]/MembershipActions.tsx` (환불 흐름 교체)

**Interfaces:**
- Consumes: `previewRefund`(noBaseline 포함), `refundMembership({ membershipId, method, amountOverride, note })`

- [ ] **Step 1: 콘솔 환불 모달**

state 추가: `const [refundAmt, setRefundAmt] = useState("");` `const [refundErr, setRefundErr] = useState<string | null>(null);`

`openRefund`를:

```tsx
async function openRefund() {
  if (!detail?.activeMembershipId) return;
  setRefund(null); setRefundErr(null); setRefundAmt(""); setRefundMethod("card");
  setModal("refund");
  const p = (await previewRefund(detail.activeMembershipId)) as { ok: boolean; refund?: number; used?: number; noBaseline?: boolean; error?: string };
  if (!p.ok) { setRefundErr(p.error ?? "환불 금액을 계산하지 못했어요. 금액을 직접 입력해주세요."); return; }
  setRefund({ refund: p.refund ?? 0, used: p.used ?? 0, noBaseline: !!p.noBaseline });
  setRefundAmt(String(p.refund ?? 0));
}
```

`doRefund`는 `refundMembership({ membershipId: detail.activeMembershipId, method: refundMethod, amountOverride: Number(refundAmt), note: undefined })` — 입력 검증: `refundAmt`가 비었거나 `!Number.isInteger(Number(refundAmt)) || Number(refundAmt) < 0`이면 toast 후 중단. confirm 버튼 `disabled={busy || refundAmt === ""}`(기존 `!refund` 조건 제거 — 미리보기 실패 시에도 직접 입력으로 진행 가능해야 함).

모달 본문의 "계산 중…" 블록을:

```tsx
{refundErr ? <div className="text-[13px] font-medium text-terracotta">{refundErr}</div> : null}
<div className="mb-1.5 text-[12px] font-medium text-[#9A8772]">
  {refund ? `산식 기준 ${won(refund.refund)} · 사용 ${refund.used}회${refund.noBaseline ? " · 결제 기록 없음(이관)" : ""}` : refundErr ? "" : "계산 중…"}
</div>
<input value={refundAmt} onChange={(e) => setRefundAmt(e.target.value.replace(/\D/g, ""))}
  inputMode="numeric" placeholder="실제 환불 금액(원)"
  className="w-full rounded-[10px] border border-ink/10 bg-white px-3.5 py-2.5 text-[20px] font-bold text-terracotta" />
```

(refund state 타입에 `noBaseline: boolean` 추가.)

- [ ] **Step 2: 모바일 환불 — ConfirmDialog → 자체 미니 모달**

`MembershipActions.tsx`의 환불 부분을 교체: `refundOpen/refundDesc` 대신

```tsx
const [refundModal, setRefundModal] = useState<null | { base: number; used: number; noBaseline: boolean }>(null);
const [amt, setAmt] = useState("");
const [method, setMethod] = useState<"card" | "cash" | "account">("account");

async function openRefund() {
  const p = await previewRefund(membershipId);
  if (!p.ok) { toast(p.error ?? "환불 정보를 불러오지 못했어요"); return; }
  const pp = p as { ok: true; refund: number; used: number; noBaseline?: boolean };
  setAmt(String(pp.refund)); setMethod("account");
  setRefundModal({ base: pp.refund, used: pp.used, noBaseline: !!pp.noBaseline });
}

async function doRefund() {
  const n = Number(amt);
  if (amt === "" || !Number.isInteger(n) || n < 0) { toast("환불 금액을 확인해주세요"); return; }
  setRefundModal(null); setBusy(true);
  const r = await refundMembership({ membershipId, method, amountOverride: n });
  setBusy(false);
  toast(r.ok ? `환불 처리했어요 (${r.refund!.toLocaleString()}원)` : (r.error ?? "환불 실패"));
  if (r.ok) router.refresh();
}
```

모달 마크업은 `EditMemberButton.tsx`의 오버레이 패턴(fixed inset-0 + bg-card 시트)을 복제해 금액 `TextInput`(inputMode numeric) + 수단 3버튼(카드/현금/계좌 — 파일 내 `MiniButton` 또는 단순 selected 토글 버튼) + "산식 기준 N원 (사용 M회)" 안내 + noBaseline이면 "이관 회원권 — 금액을 직접 입력하세요" 문구 + 취소/환불 버튼. `ConfirmDialog` refund 블록과 `refundDesc` state는 삭제.

- [ ] **Step 3: 타입체크 + 수동 확인 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(refund): 콘솔·모바일 환불 금액 입력+수단 선택, 미리보기 실패 분기 (감사3 #6·#9·#22)"
```

---

## Phase 3 · 회원권 상태 표시 + 출석 가드

### Task 9: 회원 화면 paused/expired 표시 + 결제내역 payer 전환

**Files:**
- Modify: `src/lib/data/groups/member.ts` (표시용 activeMembership, membershipView, getMemberPayments)
- Modify: `src/app/(app)/m/ui.tsx`, `src/app/(app)/m/my/ui.tsx` (배지)
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (`recordPayment`·`recordPayments`에 payer 세팅), `src/lib/data/groups/membership-actions.ts` (환불 음수행 payer)
- Modify: `src/lib/types.ts` (MemberMyView.membership에 `paused` 추가 등)

**Interfaces:**
- Consumes: Task 5 `payments.payer_member_id`
- Produces: 회원 화면에서 paused='일시정지'/expired='만료' 배지; `getMemberPayments`가 payer 기준 조회

- [ ] **Step 1: 표시용 activeMembership 확장** (`src/lib/data/groups/member.ts`)

두 쿼리의 `.eq("status","active")`를 `.in("status", ["active", "paused"])`로 바꾸고, 둘 다 없으면 만료 폴백 추가:

```ts
  // 만료 직후에도 "몇 회 남기고 만료됐는지" 보여준다(감사3 #10). refunded는 표시하지 않음.
  const { data: expired } = await sb
    .from("memberships")
    .select("id, remaining_sessions, total_sessions, end_date, status")
    .eq("member_id", memberId)
    .eq("status", "expired")
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return expired;
```

- [ ] **Step 2: 뷰에 paused 반영**

`membershipView`에 `paused: membership.status === "paused"` 추가하고 `src/lib/types.ts`의 해당 뷰 타입에 `paused: boolean` 추가. `/m` 홈 뷰(getMemberHome이 만드는 `remaining/dDay/expired` 필드 근처)도 동일하게 `paused` 추가.

UI 배지 — `my/ui.tsx`의 D-day 배지:

```tsx
{m.expired ? "만료" : m.paused ? "일시정지" : `D-${m.dDay}`}
```

`/m` 홈(`m/ui.tsx`)의 `Badge variant="remaining"`도 동일 3분기.

- [ ] **Step 3: getMemberPayments payer 기준 전환**

`getMemberPayments`에서 memberships 목록 기반 `.in("membership_id", ...)` 조회를 payer 기준으로:

```ts
const { data: pays } = await sb
  .from("payments")
  .select("id, membership_id, method, amount, paid_at")
  .eq("payer_member_id", me.memberId)
  .order("paid_at", { ascending: false });
```

라벨용 memberships는 결제 행들의 `membership_id` 집합으로 역조회(`.in("id", [...new Set(...)])`)해 `byId` 구성. memberships가 0개여도 payments가 있을 수 있으므로 초기 조기 반환(`if (!memberships.length) return ...`)은 payments 기준으로 옮긴다.

- [ ] **Step 4: 신규 결제 insert에 payer 세팅**

`owner-ops-actions.ts`: `recordPayment`와 `recordPayments`는 membership 조회 시 `member_id`도 select에 추가해(`select("price, member_id")` / `select("id, member_id")`), insert에 `payer_member_id` 포함. `membershipId`만 받고 membership을 조회하지 않는 경로가 있으면 `select("member_id")` 1회 조회 추가. `addRevenue`(membership 없음)는 payer null 유지. `membership-actions.ts`의 환불 음수행 insert에도 `payer_member_id`(해당 membership의 member_id) 포함.

- [ ] **Step 5: 타입체크 + 수동 확인 + 커밋**

수동: 테스트 회원권 일시정지 → /m·/m/my에서 잔여+일시정지 배지 표시, 양도 후 원 결제자 결제내역 잔존 확인.

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(member): paused/expired 회원권 표시 + 결제내역 payer 스냅샷 기준 (감사3 #10·#14)"
```

### Task 10: 무회원권 출석 가드 + 재시도 문구 분리

**Files:**
- Modify: `src/lib/data/groups/scheduling-actions.ts` (`deductForMembers`, `confirmAttendance`)

**Interfaces:**
- Consumes: 기존 `restoreProcessedSession` 보상 로직(실패 시 자동 원복)
- Produces: attend/noshow 시 활성 회원권 없으면 `{ok:false, error:"...회원권이 없어요..."}`; 클레임 실패 문구 2종 분리

- [ ] **Step 1: deductForMembers 가드**

`deductForMembers` 내부의 `if (!ms) { before = null; after = null; ... }` 분기 앞에(액션 종류가 인자에 있음):

```ts
// 활성 회원권이 없는데 차감 대상 처리(출석/노쇼)면 무경고 무료 수업으로 남지 않게 명시 거부(감사3 #11).
// cancel은 회원권 없이도 기록 자체는 의미가 있으므로 기존 동작 유지.
if (args.deducted && !ms && args.action !== "cancel") {
  return "활성 회원권이 없어요 — 재등록/일시정지 재개를 먼저 확인해주세요.";
}
```

(반환 문자열이 failMsg → `confirmAttendance`의 기존 보상 경로 `restoreProcessedSession`이 세션을 scheduled로 원복.) 그리고 ledger insert의 `deducted` 값이 정책값 그대로라면 실제 적용 여부(`args.deducted && !!ms`)로 기록하도록 수정.

- [ ] **Step 2: 클레임 실패 문구 분리**

`confirmAttendance`의 `if (!claimed || claimed.length === 0)`에서:

```ts
if (!claimed || claimed.length === 0) {
  // 원인 구분: 이미 처리된 수업(재시도/이중탭) vs 남의 수업 — 뭉뚱그린 문구가 재시도 사용자를 오해시킴(감사3 #22)
  const { data: s } = await sb.from("sessions").select("status, trainer_id").eq("id", sessionId).maybeSingle();
  if (s && s.status !== "scheduled" && (t.role === "owner" || s.trainer_id === t.id))
    return { ok: false, error: "이미 처리된 수업이에요" };
  return { ok: false, error: "담당 수업이 아니에요" };
}
```

- [ ] **Step 3: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "fix(attend): 무회원권 출석 명시 거부 + 클레임 실패 문구 분리 (감사3 #11·#22)"
```

---

## Phase 4 · 나머지 medium/low

### Task 11: 콘솔 발급·신규등록 금액 입력

**Files:**
- Modify: `src/lib/data/groups/console-actions.ts` (`consoleIssueMembership`에 amount)
- Modify: `src/app/console/members/ui.tsx` (발급/신규등록 모달 금액 필드)
- Modify: `src/lib/data/groups/owner-ops-actions.ts` (`createMember`의 payment 파라미터에 amount 전달 — 시그니처 확인 후)

**Interfaces:**
- Consumes: `recordPayment({ membershipId, method, amount })` — amount는 이미 지원(0 이하 거부 검증 존재)
- Produces: `consoleIssueMembership(memberId, productId, method, amount?: number)`

- [ ] **Step 1: 액션에 amount 전달**

```ts
export async function consoleIssueMembership(
  memberId: string, productId: string, method: PaymentMethod, amount?: number,
): Promise<{ ok: boolean; error?: string }> {
  const issued = await issueMembership(memberId, productId);
  if (!issued.ok || !issued.membershipId) return { ok: false, error: issued.error ?? "발급에 실패했어요" };
  const paid = await recordPayment({ membershipId: issued.membershipId, method, amount });
  // ...기존 보상 로직 그대로
```

`createMember`의 `payment` 파라미터 타입을 확인해 `amount?: number`를 지원하지 않으면 추가하고 내부 `recordPayment` 호출에 전달.

- [ ] **Step 2: 모달 UI**

발급 모달: `const [issueAmt, setIssueAmt] = useState("");` — `openIssue()`에서 `setIssueAmt(String(products[0]?.price ?? ""))`, 상품 select 변경 시 해당 상품 price로 갱신. 금액 input(콘솔 기존 input 스타일)을 수단 픽커 위에 추가, `doIssue()`는 `consoleIssueMembership(selectedId, issueProduct, issueMethod, Number(issueAmt))` + `Number.isInteger && > 0` 검증. `products` prop에 price가 없으면 게터에 추가. 신규등록(doAdd) 모달도 동일하게 `f.amount` 추가 → `payment: { method: f.method, amount: Number(f.amount) }`.

- [ ] **Step 3: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(console): 발급·신규등록 결제 금액 입력(할인/분할 대응) (감사3 #12)"
```

### Task 12: 옛 스레드 unread 제외 (canonical 기준)

**Files:**
- Modify: `src/lib/data/groups/member.ts` (`getMemberChatUnread`)

**Interfaces:**
- Consumes: `ensureChatThread(memberId)` (`@/lib/data/groups/chat` export — member.ts에서 이미 쓰는 `ensureMemberThread` 경유든 직접이든 동일 함수인지 확인)
- Produces: 회원 unread = 열 수 있는 canonical 스레드의 미읽음만

- [ ] **Step 1: 구현**

`getMemberChatUnread`를 canonical 스레드 1개 기준으로:

```ts
export async function getMemberChatUnread(): Promise<number> {
  const me = await getMemberContext();
  if (!me) return 0;
  // 회원 채팅방은 canonical 스레드 하나만 열린다 — 담당/유형 변경으로 남은 옛 스레드의 메시지를
  // 세면 끌 수 없는 유령 배지가 된다(감사3 #15).
  const threadId = await ensureChatThread(me.memberId);
  if (!threadId) return 0;
  const { data: cp } = await sb
    .from("chat_participants")
    .select("last_read_at")
    .eq("thread_id", threadId)
    .eq("member_id", me.memberId)
    .maybeSingle();
  let q = sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .eq("thread_id", threadId)
    .neq("sender_id", me.memberId);
  if (cp?.last_read_at) q = q.gt("created_at", cp.last_read_at as string);
  const { count } = await q;
  return count ?? 0;
}
```

- [ ] **Step 2: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "fix(chat): 회원 unread를 canonical 스레드 기준으로 — 유령 배지 제거 (감사3 #15)"
```

### Task 13: 캘린더 노쇼/취소 배지

**Files:**
- Modify: `src/lib/data/groups/trainer-home.ts` (`mapDayClass` 배지 분기)

- [ ] **Step 1: 분기 추가**

```ts
let badge: BadgeView | undefined;
if (s.status === "attended") badge = { text: "완료", variant: "done" };
else if (s.status === "noshow") badge = { text: "노쇼", variant: "done" };
else if (s.status === "cancelled") badge = { text: "취소", variant: "done" };
else if (isTeam) badge = { text: "2:1", variant: "team" };
else badge = { text: "예정", variant: "scheduled" };
```

`BadgeView`의 variant 유니온에 노쇼/취소용 값이 따로 있으면 그걸 쓰고, 없으면 `done`(중립 무채색) 재사용 — `src/components`의 Badge 렌더러에서 variant 목록 확인. `noshow`가 bar 색 else 분기로 일반색을 받는 것도 `BAR.cancelled`로 통일할지 확인(취소와 동일 회색 권장).

- [ ] **Step 2: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "fix(calendar): 노쇼·취소 세션 배지 표시 — '예정' 오표기 제거 (감사3 #16)"
```

### Task 14: propose 유연화 (직접 일시 + 사유 텍스트)

**Files:**
- Modify: `src/app/(app)/t/class/[id]/propose/ui.tsx`

**Interfaces:**
- Consumes: `sendPropose(sessionId, slotsIso: string[], reason?: string)` — 서버는 임의 ISO를 이미 수용(슬롯 검증이 서버에 없음: `scheduling-actions.ts:128-156` 확인됨)

- [ ] **Step 1: 직접 일시 입력**

state 추가: `const [customDate, setCustomDate] = useState(""); const [customTime, setCustomTime] = useState("");`
슬롯 목록 아래에:

```tsx
<div className="mt-2.5 flex items-center gap-2 rounded-[13px] border border-ink/[0.08] bg-card px-4 py-3">
  <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)}
    className="flex-1 bg-transparent text-[14px] font-semibold text-ink" />
  <input type="time" value={customTime} onChange={(e) => setCustomTime(e.target.value)} step={1800}
    className="bg-transparent text-[14px] font-semibold text-ink" />
</div>
```

전송 시 커스텀 슬롯 합류(KST 입력 → UTC ISO):

```tsx
const customIso = customDate && customTime
  ? new Date(new Date(`${customDate}T${customTime}:00+09:00`).getTime()).toISOString()
  : null;
const slotsIso = [...view.slots.filter((s) => picked.has(s.id)).map((s) => s.iso), ...(customIso ? [customIso] : [])];
if (slotsIso.length === 0) return; // 버튼 disabled 조건도 count===0 && !customIso 로 갱신
```

버튼 라벨의 `{count}`도 `count + (customIso ? 1 : 0)`로. 과거 시각 방지: `customIso && customIso <= new Date().toISOString()`이면 toast("지난 시간은 제안할 수 없어요") 후 중단.

- [ ] **Step 2: '직접 입력' 사유 텍스트**

```tsx
const [reasonText, setReasonText] = useState("");
```
사유 칩 아래에 `reason === "직접 입력"`일 때만:

```tsx
{reason === "직접 입력" ? (
  <input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="사유를 입력해주세요"
    className="mt-2.5 w-full rounded-[12px] border border-ink/[0.08] bg-card px-3.5 py-2.5 text-[13.5px]" />
) : null}
```

전송: `sendPropose(sessionId, slotsIso, reason === "직접 입력" ? (reasonText.trim() || undefined) : (reason ?? undefined))`. 그리고 `sendPropose` 결과의 `ok`를 확인해 실패 토스트(현재 무조건 성공 토스트 — 같은 김에 수정).

- [ ] **Step 3: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(propose): 직접 일시 제안 + 사유 직접 입력 (감사3 #17)"
```

### Task 15: PWA 복귀 시 새로고침

**Files:**
- Create: `src/components/shell/RefreshOnFocus.tsx`
- Modify: `src/app/(app)/layout.tsx` (마운트)

- [ ] **Step 1: 컴포넌트**

```tsx
"use client";
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/** 백그라운드에 있던 PWA가 복귀하면 서버 데이터를 갱신한다(어제 홈·만료된 signed URL 방지). 60초 스로틀. */
export function RefreshOnFocus() {
  const router = useRouter();
  const last = useRef(Date.now());
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last.current < 60_000) return;
      last.current = Date.now();
      router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);
  return null;
}
```

- [ ] **Step 2: 마운트**

`src/app/(app)/layout.tsx`:

```tsx
import { Frame } from "@/components/shell/Frame";
import { ToastProvider } from "@/components/ui/Toast";
import { RefreshOnFocus } from "@/components/shell/RefreshOnFocus";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Frame>
      <RefreshOnFocus />
      <ToastProvider>{children}</ToastProvider>
    </Frame>
  );
}
```

- [ ] **Step 3: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "feat(pwa): 복귀 시 router.refresh(60s 스로틀) — stale 화면·깨진 이미지 방지 (감사3 #18)"
```

### Task 16: 로드 상한 + 더보기

**Files:**
- Modify: `src/lib/data/groups/meals.ts` (limit + 더보기 액션), `src/lib/data/groups/member-files.ts` (limit), `src/lib/data/groups/chat.ts`·`src/lib/data/groups/member.ts` (채팅 최근 100건)
- Modify: `src/app/(app)/m/my/meals/ui.tsx` 등 해당 화면(더보기 버튼)

**Interfaces:**
- Produces: `listMeals`/`listFiles`가 최근 N건만; `loadMoreMeals(offset)`·`loadMoreFiles(memberId, offset)` 서버 함수; 채팅 getter는 최근 100건(오름차순 유지)

- [ ] **Step 1: 쿼리 상한**

- `meals.ts` `listMeals`: `.order(...).range(offset, offset + 59)` 형태로 `offset=0` 기본 인자화, 반환에 `hasMore`(가져온 개수===60) 동봉하도록 wrapper 타입 조정 — 호출부(회원 화면·강사 열람) 갱신.
- `member-files.ts` `listFiles`: `.limit(60)` (더보기는 파일 화면 구조 확인 후 meals와 동일 패턴).
- `chat.ts` `getChatRoom` / `member.ts`의 회원 채팅 메시지 조회: `.order("created_at", { ascending: false }).limit(100)` 후 `rows.reverse()`로 기존 오름차순 유지. 100건 가득이면 뷰에 `truncated: true`를 내려 상단에 "최근 100개 메시지만 표시돼요" 캡션 렌더(폴링 merge는 신규 append만 하므로 영향 없음).

- [ ] **Step 2: 더보기 UI (식단·사진)**

meals 화면: `const [extra, setExtra] = useState<MealLog[]>([]); const [offset, setOffset] = useState(60);` — 서버 액션 `loadMoreMeals(offset)`(member 컨텍스트로 본인 것만) 추가하고 목록 하단 `hasMore`일 때 "더보기" 버튼 → append. 파일(진행사진) 화면도 동일 패턴. 채팅 '이전 대화 더보기'는 이번 라운드 제외(캡션으로 대체 — 폴링 병합과의 상호작용 리스크 대비 가치가 낮음, 스펙 대비 의도적 축소이므로 커밋 메시지에 명시).

- [ ] **Step 3: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "perf(data): 채팅 100건·식단/사진 60건 상한 + 식단/사진 더보기 (감사3 #19; 채팅 이전대화 로드는 캡션으로 대체)"
```

### Task 17: 회원 세션 슬라이딩 + 파괴적 액션 confirm

**Files:**
- Modify: `src/middleware.ts` (만료 임박 재서명)
- Modify: `src/app/(app)/m/my/meals/ui.tsx` (삭제 confirm)
- Modify: `src/app/(app)/t/members/[id]/MembershipActions.tsx` (연장 confirm)

- [ ] **Step 1: 세션 슬라이딩**

`src/middleware.ts`의 `/m` 분기를:

```ts
if (pathname.startsWith("/m")) {
  const session = await verifySession(request.cookies.get(MEMBER_COOKIE)?.value);
  if (!session) {
    const url = request.nextUrl.clone();
    url.pathname = "/login/member";
    return NextResponse.redirect(url);
  }
  // 슬라이딩 연장: 만료 7일 이내면 재서명 — 30일 하드만료로 열린 앱이 조용히 먹통되는 것 방지(감사3 #20)
  if (session.exp && session.exp - Date.now() < 7 * 86400000) {
    const token = await signSession({ memberId: session.memberId, name: session.name });
    const res = NextResponse.next();
    res.cookies.set(MEMBER_COOKIE, token, {
      httpOnly: true, sameSite: "lax",
      secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30,
    });
    return res;
  }
  return NextResponse.next();
}
```

import에 `signSession` 추가. (`signSession`/`verifySession`은 Web Crypto라 Edge 런타임 안전 — 파일 첫 주석에 명시돼 있음.)

- [ ] **Step 2: 식단 삭제 confirm**

`meals/ui.tsx` `remove()` 첫 줄에:

```ts
if (!confirm("이 식단 기록을 삭제할까요? 사진과 선생님 피드백도 함께 삭제되고 되돌릴 수 없어요.")) return;
```

- [ ] **Step 3: 연장 confirm**

`MembershipActions.tsx` `onExtend()` 첫 줄에:

```ts
if (!confirm("유효기간을 상품 기간만큼 연장할까요?")) return;
```

- [ ] **Step 4: 타입체크 + 커밋**

```bash
bunx tsc --noEmit
git add -A && git commit -m "fix(ux): 회원 세션 슬라이딩 연장 + 식단 삭제·연장 confirm (감사3 #20·#21)"
```

### Task 18: 최종 검증 + 배포

**Files:** 없음 (검증·배포만)

- [ ] **Step 1: 전체 테스트·빌드**

```bash
bun test
bunx tsc --noEmit
bun run build
```
Expected: 모두 통과. 실패 시 해당 태스크로 돌아가 수정.

- [ ] **Step 2: 수동 스모크 (dev)**

- 회원 로그인(생년월일) → /m 홈·마이 배지(일시정지/만료 케이스)
- 강사 비번 초기화 → 임시비번 로그인 → 변경 강제
- 환불: 협의 금액 → 매출 음수 행 → 환불 취소 → 복원
- 콘솔 발급 금액 수정 입력 → 매출 반영
- 무회원권 세션 출석 → 에러 문구
- propose 직접 일시 전송 → 회원 수신 화면

- [ ] **Step 3: 마이그레이션 0018 프로드 적용 확인 후 배포 (메모리 규칙: push 후 deploy)**

```bash
git push origin main
bash scripts/deploy-prod.sh
```

- [ ] **Step 4: 메모리 백로그 갱신**

`~/.claude/.../memory/audit3-real-usage-remaining.md`에서 완료 항목 제거, 웹푸시(스펙 2)만 잔여로 남김.
