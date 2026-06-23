# 트레이너 "운영" 현황 탭 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대표 전용 "실적" 탭을 돈을 완전히 뺀 스튜디오 전체 "운영 현황" 대시보드로 재구성한다.

**Architecture:** KST 월/주 경계 계산을 순수 모듈로 분리해 단위 테스트하고, 그 위에
스튜디오 전체(무필터) 집계 함수 `getStudioOverview()`를 owner-ops 모듈에 추가한다. 페이지는
사람·수업·출석 중심으로 다시 그리고, 매출 표기는 모두 제거한다. 재등록 데이터는 owner면
가게 전체 범위로 넓힌다.

**Tech Stack:** Next.js 16 (App Router, RSC), TypeScript, Supabase(service-role), Tailwind v4, bun test.

## Global Constraints

- 런타임/도구: **Bun** 사용. 테스트는 `bun test`, 빌드/타입체크는 `bun run build`(= `next build`).
- 라우트 경로 `/t/perf`는 **변경하지 않는다** (revalidatePath 참조 보존). 탭 라벨만 "운영".
- **운영 현황 화면(`/t/perf`)에 ₩/금액 표기를 한 곳도 두지 않는다.**
- 스튜디오 전체 집계 = `trainer_id` 필터 없이 조회. 단일 가게(테넌트) 전제.
- 기존 owner 분기 관용구를 따른다: `if (t.role !== "owner") q = q.eq("trainer_id", t.id)`.
- KST 오프셋은 `9 * 60 * 60 * 1000`. 주 = **월~토**(6일), 차트 바 합 = `weekClasses`.
- 확정된 enum: `trainer_status('active','invited','inactive')`,
  `member_status('active','rest','inactive')`, `membership_status('active','expired')`,
  `session_status('scheduled','attended','noshow','cancelled')`.

---

## File Structure

- `src/lib/data/kst-bounds.ts` — **신규**. 순수 KST 경계/라벨 계산 (server-only 없음, 테스트 대상).
- `src/lib/data/kst-bounds.test.ts` — **신규**. 위 순수 함수의 단위 테스트.
- `src/lib/data/db.ts` — **수정**. 위 순수 함수를 감싸는 `monthBoundsKst()/weekBoundsKst()/currentMonthLabel()` export 추가.
- `src/lib/types.ts` — **수정**. `StudioOverview` 인터페이스 추가.
- `src/lib/data/groups/owner-ops.ts` — **수정**. `getStudioOverview()` + private `buildWeeklyBars()` 추가.
- `src/lib/data/groups/perf-retention.ts` — **수정**. `getRetention()` owner 분기, `getPerf()` 및 죽은 private 헬퍼 제거.
- `src/components/trainer/tabs.ts` — **수정**. owner 탭 라벨/아이콘 교체.
- `src/app/(app)/t/perf/page.tsx` — **수정**. 전면 재작성(운영 현황).

---

### Task 1: 순수 KST 경계 헬퍼 + 테스트 + db 래퍼

**Files:**
- Create: `src/lib/data/kst-bounds.ts`
- Test: `src/lib/data/kst-bounds.test.ts`
- Modify: `src/lib/data/db.ts`

**Interfaces:**
- Produces (pure, `kst-bounds.ts`):
  - `monthBoundsFromKst(kstNow: Date): { startISO: string; endISO: string }`
  - `weekBoundsFromKst(kstNow: Date): { startISO: string; endISO: string }` — 월~토(6일) 범위
  - `monthLabelFromKst(kstNow: Date): string` — "YYYY년 M월"
  - `kstNow`는 `getUTC*()`가 KST 벽시계 값으로 읽히는 Date (= `nowKstParts()`가 반환하는 형태).
- Produces (`db.ts`, server 래퍼, 인자 없음):
  - `monthBoundsKst(): { startISO: string; endISO: string }`
  - `weekBoundsKst(): { startISO: string; endISO: string }`
  - `currentMonthLabel(): string`

- [ ] **Step 1: 실패하는 테스트 작성** — `src/lib/data/kst-bounds.test.ts`

```ts
import { test, expect } from "bun:test";
import { monthBoundsFromKst, weekBoundsFromKst, monthLabelFromKst } from "./kst-bounds";

// KST 2026-06-23 (화요일) 12:00 — getUTC* 필드가 KST 벽시계로 읽히는 Date.
const kst = new Date(Date.UTC(2026, 5, 23, 12, 0, 0));

test("weekBoundsFromKst → 그 주의 월~토 (KST), 실제 UTC instant", () => {
  const { startISO, endISO } = weekBoundsFromKst(kst);
  expect(startISO).toBe("2026-06-21T15:00:00.000Z"); // 월 2026-06-22 00:00 KST
  expect(endISO).toBe("2026-06-27T15:00:00.000Z");   // 일 2026-06-28 00:00 KST (월~토 끝)
});

test("monthBoundsFromKst → 2026년 6월 경계 (UTC)", () => {
  const { startISO, endISO } = monthBoundsFromKst(kst);
  expect(startISO).toBe("2026-05-31T15:00:00.000Z"); // 2026-06-01 00:00 KST
  expect(endISO).toBe("2026-06-30T15:00:00.000Z");   // 2026-07-01 00:00 KST
});

test("monthLabelFromKst → '2026년 6월'", () => {
  expect(monthLabelFromKst(kst)).toBe("2026년 6월");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun test src/lib/data/kst-bounds.test.ts`
Expected: FAIL — `Cannot find module './kst-bounds'` (모듈 미존재).

- [ ] **Step 3: 순수 모듈 구현** — `src/lib/data/kst-bounds.ts`

```ts
/** 순수 KST 경계/라벨 계산. server-only 의존 없음 → 단위 테스트 가능. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** `kstNow`: getUTC*()가 KST 벽시계 값으로 읽히는 Date (nowKstParts() 형태). */
export function monthBoundsFromKst(kstNow: Date): { startISO: string; endISO: string } {
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - KST_OFFSET_MS);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

/** 그 주의 월요일 00:00 KST ~ 일요일 00:00 KST (월~토 6일 커버), 실제 UTC instant. */
export function weekBoundsFromKst(kstNow: Date): { startISO: string; endISO: string } {
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate();
  const dow = kstNow.getUTCDay();        // 0=일..6=토 (KST)
  const daysSinceMon = (dow + 6) % 7;    // 월=0 .. 일=6
  const start = new Date(Date.UTC(y, m, d - daysSinceMon) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m, d - daysSinceMon + 6) - KST_OFFSET_MS);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

export function monthLabelFromKst(kstNow: Date): string {
  return `${kstNow.getUTCFullYear()}년 ${kstNow.getUTCMonth() + 1}월`;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun test src/lib/data/kst-bounds.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: db.ts에 server 래퍼 추가** — `src/lib/data/db.ts`

파일 상단 import 블록(현재 1-2행)에 추가:

```ts
import { monthBoundsFromKst, weekBoundsFromKst, monthLabelFromKst } from "./kst-bounds";
```

파일 끝(`dayDiff` 정의 뒤)에 추가:

```ts
/** 현재 KST 월 경계 [1일 00:00, 다음달 1일 00:00) — 실제 UTC instant. */
export function monthBoundsKst(): { startISO: string; endISO: string } {
  return monthBoundsFromKst(nowKstParts());
}

/** 현재 KST 주 경계 (월~토 커버) — 실제 UTC instant. */
export function weekBoundsKst(): { startISO: string; endISO: string } {
  return weekBoundsFromKst(nowKstParts());
}

/** "YYYY년 M월" (현재 KST 월). */
export function currentMonthLabel(): string {
  return monthLabelFromKst(nowKstParts());
}
```

- [ ] **Step 6: 커밋**

```bash
git add src/lib/data/kst-bounds.ts src/lib/data/kst-bounds.test.ts src/lib/data/db.ts
git commit -m "feat(data): pure KST month/week bounds helpers + tested wrappers"
```

---

### Task 2: `StudioOverview` 타입 + `getStudioOverview()` 집계 함수

**Files:**
- Modify: `src/lib/types.ts` (`PerfBar` 인터페이스 뒤, 약 227행 이후)
- Modify: `src/lib/data/groups/owner-ops.ts`

**Interfaces:**
- Consumes: `monthBoundsKst()`, `weekBoundsKst()`, `currentMonthLabel()`, `kstWeekday()`, `todayISO()`, `dayDiff()`, `sb`, `getTrainerContext()` (모두 `@/lib/data/db`); `PerfBar` (`@/lib/types`).
- Produces: `getStudioOverview(): Promise<StudioOverview>`.

- [ ] **Step 1: `StudioOverview` 타입 추가** — `src/lib/types.ts`

기존 `PerfBar` 인터페이스(223-227행) 바로 아래에 추가:

```ts
export interface StudioOverview {
  monthLabel: string;     // "2026년 6월"
  activeMembers: number;  // 가게 전체 활성 회원 수
  newThisMonth: number;   // 이번 달(KST) 신규 가입 회원 수
  weekClasses: number;    // 이번 주(월~토, KST) 수업 타임 수 — 전체 트레이너
  attendRate: number;     // 이번 달 전체 출석률 (%)
  trainerCount: number;   // 활성 트레이너 수 (status='active')
  weeklyBars: PerfBar[];  // 같은 이번 주(월~토) 수업의 요일별 분포 — 합 = weekClasses
  expiringCount: number;  // 14일 내 만료 임박 활성 회원권 수 — 전체
}
```

- [ ] **Step 2: owner-ops.ts import 보강** — `src/lib/data/groups/owner-ops.ts`

현재 db import 블록(2-10행)에 `monthBoundsKst, weekBoundsKst, currentMonthLabel, kstWeekday`를 추가하고, types import 블록(11-19행)에 `PerfBar`를 추가한다. 결과 예:

```ts
import {
  sb,
  getTrainerContext,
  weekdayKo,
  hourLabel,
  todayISO,
  dayDiff,
  nowKstParts,
  monthBoundsKst,
  weekBoundsKst,
  currentMonthLabel,
  kstWeekday,
} from "@/lib/data/db";
import type {
  AvatarTone,
  BadgeView,
  Me,
  MemberDetailView,
  MembershipProduct,
  PerfBar,
  StaffMember,
  StudioOverview,
  TeamAvatar,
} from "@/lib/types";
```

- [ ] **Step 3: `buildWeeklyBars` + `getStudioOverview` 구현**

`owner-ops.ts` 끝에 추가:

```ts
/* ---------------------------- studio overview ---------------------------- */
/** 월~토 요일 막대. weekdays = sessions의 KST 요일 번호(0=일..6=토) 리스트. */
function buildWeeklyBars(weekdays: number[]): PerfBar[] {
  const order = [1, 2, 3, 4, 5, 6]; // 월..토
  const labels = ["월", "화", "수", "목", "금", "토"];
  const counts = order.map((wd) => weekdays.filter((w) => w === wd).length);
  const max = Math.max(...counts, 0);
  return order.map((_, i) => {
    const c = counts[i];
    const valuePx = Math.min(60, Math.max(8, c * 8));
    return { label: labels[i], valuePx, emphasized: max > 0 && c === max };
  });
}

/** 대표 전용 운영 현황: 스튜디오 전체(무필터) 집계. ₩ 미포함. */
export async function getStudioOverview(): Promise<StudioOverview> {
  const monthLabel = currentMonthLabel();
  const t = await getTrainerContext();
  if (!t) {
    return {
      monthLabel,
      activeMembers: 0,
      newThisMonth: 0,
      weekClasses: 0,
      attendRate: 100,
      trainerCount: 0,
      weeklyBars: buildWeeklyBars([]),
      expiringCount: 0,
    };
  }

  const { startISO: monStart, endISO: monEnd } = monthBoundsKst();
  const { startISO: wkStart, endISO: wkEnd } = weekBoundsKst();
  const today = todayISO();

  // 활성 회원권(전체) — 활동 회원 수 + 만료 임박 둘 다에 재사용.
  const { data: activeMs } = await sb
    .from("memberships")
    .select("member_id, end_date")
    .eq("status", "active");
  const activeRows = activeMs ?? [];
  const activeMembers = new Set(activeRows.map((m) => m.member_id)).size;
  const expiringCount = activeRows.filter((m) => {
    const d = dayDiff(today, m.end_date);
    return d >= 0 && d <= 14;
  }).length;

  // 이번 달 신규 회원(전체).
  const { count: newCount } = await sb
    .from("members")
    .select("id", { count: "exact", head: true })
    .gte("created_at", monStart)
    .lt("created_at", monEnd);
  const newThisMonth = newCount ?? 0;

  // 이번 주(월~토) 수업(전체) — 개수 + 요일 분포.
  const { data: weekSess } = await sb
    .from("sessions")
    .select("scheduled_at")
    .gte("scheduled_at", wkStart)
    .lt("scheduled_at", wkEnd);
  const weekRows = weekSess ?? [];
  const weekClasses = weekRows.length;
  const weeklyBars = buildWeeklyBars(weekRows.map((s) => kstWeekday(s.scheduled_at)));

  // 이번 달 출석률(전체).
  const { data: monthSess } = await sb
    .from("sessions")
    .select("status")
    .gte("scheduled_at", monStart)
    .lt("scheduled_at", monEnd);
  const msRows = monthSess ?? [];
  const attended = msRows.filter((s) => s.status === "attended").length;
  const noshow = msRows.filter((s) => s.status === "noshow").length;
  const denom = attended + noshow;
  const attendRate = denom > 0 ? Math.round((attended / denom) * 100) : 100;

  // 활성 트레이너 수.
  const { count: tCount } = await sb
    .from("trainers")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
  const trainerCount = tCount ?? 0;

  return {
    monthLabel,
    activeMembers,
    newThisMonth,
    weekClasses,
    attendRate,
    trainerCount,
    weeklyBars,
    expiringCount,
  };
}
```

- [ ] **Step 4: 타입체크/빌드 통과 확인**

Run: `bun run build`
Expected: 성공 (타입 오류 없음). `getStudioOverview`가 아직 페이지에서 import되지 않아도 빌드는 통과해야 한다.

- [ ] **Step 5: 커밋**

```bash
git add src/lib/types.ts src/lib/data/groups/owner-ops.ts
git commit -m "feat(data): studio-wide getStudioOverview aggregation (no revenue)"
```

---

### Task 3: `getRetention()` owner 인지화 + `getPerf()` 및 죽은 헬퍼 제거

**Files:**
- Modify: `src/lib/data/groups/perf-retention.ts`

**Interfaces:**
- Consumes: 변경 없음 (`getTrainerContext`, `todayISO`, `dayDiff`, `sb`, `asTone`).
- Produces: `getRetention(): Promise<RetentionView>` — owner면 가게 전체, 강사면 본인 범위.
- Removes: `getPerf`, private `monthBoundsKst`, private `currentMonthLabel`, private `buildWeeklyBars`.
- `PerfBar`/`PerfSummary` 타입은 유지(다른 곳/mock에서 참조). 이 파일의 `getPerf`만 제거.

- [ ] **Step 1: `getRetention`을 owner 분기로 교체**

`perf-retention.ts`의 기존 `getRetention`(약 163-225행)을 아래로 교체:

```ts
/* ----------------------------- retention ----------------------------- */
export async function getRetention(): Promise<RetentionView> {
  const t = await getTrainerContext();
  const empty: RetentionView = { expiringCount: 0, expectedRevenue: 0, items: [], pendingCount: 0 };
  if (!t) return empty;

  // 활성 회원권 조회: owner는 가게 전체, 강사는 본인 담당으로 한정.
  let msQuery = sb
    .from("memberships")
    .select("member_id, remaining_sessions, end_date, price, guided, status")
    .eq("status", "active");

  if (t.role !== "owner") {
    const { data: links } = await sb
      .from("member_trainers")
      .select("member_id")
      .eq("trainer_id", t.id);
    const memberIds = Array.from(new Set((links ?? []).map((l) => l.member_id)));
    if (memberIds.length === 0) return empty;
    msQuery = msQuery.in("member_id", memberIds);
  }

  const { data: memberships } = await msQuery;

  const today = todayISO();
  const expiring = (memberships ?? [])
    .map((m) => ({ ...m, dDay: dayDiff(today, m.end_date) }))
    .filter((m) => m.dDay >= 0 && m.dDay <= 14)
    .sort((a, b) => a.dDay - b.dDay);

  const expMemberIds = expiring.map((m) => m.member_id);
  const memberById = new Map<string, { name: string; avatar_tone: string }>();
  if (expMemberIds.length > 0) {
    const { data: members } = await sb
      .from("members")
      .select("id, name, avatar_tone")
      .in("id", expMemberIds);
    for (const mm of members ?? []) {
      memberById.set(mm.id, { name: mm.name, avatar_tone: mm.avatar_tone });
    }
  }

  const items = expiring.map((m) => {
    const info = memberById.get(m.member_id);
    const name = info?.name ?? "";
    return {
      memberId: m.member_id,
      name,
      initial: name.charAt(0),
      avatarTone: asTone(info?.avatar_tone),
      remaining: m.remaining_sessions,
      dDay: m.dDay,
      guided: !!m.guided,
    };
  });

  const priceSum = expiring.reduce((s, m) => s + (m.price ?? 0), 0);
  const expectedRevenue = priceSum > 0 ? priceSum : Math.round(items.length * 1_400_000);

  return {
    expiringCount: items.length,
    expectedRevenue,
    items,
    pendingCount: items.filter((i) => !i.guided).length,
  };
}
```

- [ ] **Step 2: `getPerf` 및 죽은 private 헬퍼 제거**

`perf-retention.ts`에서 다음을 모두 삭제한다:
- `export async function getPerf(...) { ... }` 전체 (약 37-143행).
- private `function currentMonthLabel()` (약 13-17행).
- private `function monthBoundsKst()` (약 19-29행).
- private `function buildWeeklyBars(...)` (약 145-160행).

`asTone`(약 31-34행)은 **남긴다**(`getRetention`에서 사용). import 중 더 이상 쓰지 않는 것
(`kstWeekday`, `nowKstParts` 등)이 있으면 import 목록에서 제거한다.

- [ ] **Step 3: 죽은 참조 없음 확인**

```bash
grep -rn "getPerf" src --include="*.ts" --include="*.tsx" | grep -v "mock.ts"
```
Expected: 출력 없음 (live 코드에 `getPerf` 잔존 없음; `mock.ts`만 제외 대상).

- [ ] **Step 4: 빌드 통과 확인**

Run: `bun run build`
Expected: 성공 (미사용 변수/타입 오류 없음).

- [ ] **Step 5: 커밋**

```bash
git add src/lib/data/groups/perf-retention.ts
git commit -m "feat(retention): owner sees studio-wide; drop unused getPerf"
```

---

### Task 4: 탭 라벨/아이콘 교체 + 운영 현황 페이지 재작성

**Files:**
- Modify: `src/components/trainer/tabs.ts:15`
- Modify: `src/app/(app)/t/perf/page.tsx` (전면 재작성)

**Interfaces:**
- Consumes: `getStudioOverview()` (`@/lib/data/groups/owner-ops`), `trainerTabs()`, `Stat`, `BarChart`, `Card`, `Icon`, `Body`, `TabBar`, `getTrainerContext`, `sb`.

- [ ] **Step 1: 탭 라벨/아이콘 교체** — `src/components/trainer/tabs.ts`

15행을 교체:

```ts
  if (isOwner) tabs.push({ label: "운영", href: "/t/perf", icon: "home", activeIcon: "home-fill" });
```

- [ ] **Step 2: 페이지 전면 재작성** — `src/app/(app)/t/perf/page.tsx`

파일 전체를 아래로 교체:

```tsx
import Link from "next/link";
import { Body } from "@/components/shell/Body";
import { TabBar } from "@/components/shell/TabBar";
import { Card } from "@/components/ui/Card";
import { Stat } from "@/components/ui/StatCard";
import { BarChart } from "@/components/ui/BarChart";
import { Icon } from "@/components/ui/icon";
import { trainerTabs } from "@/components/trainer/tabs";
import { getStudioOverview } from "@/lib/data/groups/owner-ops";
import { sb, getTrainerContext } from "@/lib/data/db";

/** Unread chat count for this trainer (for the tab badge). */
async function chatUnreadFor(trainerId: string): Promise<number> {
  const { data } = await sb
    .from("chat_threads")
    .select("id")
    .eq("trainer_id", trainerId);
  const threadIds = (data ?? []).map((t) => t.id);
  if (threadIds.length === 0) return 0;
  const { count } = await sb
    .from("chat_messages")
    .select("id", { count: "exact", head: true })
    .in("thread_id", threadIds)
    .eq("sender_type", "member")
    .eq("read_by_trainer", false);
  return count ?? 0;
}

export default async function TrainerOpsPage() {
  const t = await getTrainerContext();
  const isOwner = t?.role === "owner";
  const ov = await getStudioOverview();
  const chatUnread = t ? await chatUnreadFor(t.id) : 0;

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        {/* header */}
        <div className="mb-3.5 flex items-center justify-between">
          <div>
            <div className="text-[13px] font-medium text-muted">{ov.monthLabel}</div>
            <div className="text-[21px] font-bold text-ink">운영 현황</div>
          </div>
          <Link
            href="/t/settings"
            aria-label="설정"
            className="tappable flex h-[42px] w-[42px] items-center justify-center rounded-[13px] border border-ink/[0.07] bg-card text-sage-deep"
          >
            <Icon name="setting" size={20} />
          </Link>
        </div>

        {/* hero — active members (people, not money) */}
        <div className="mb-2.5 rounded-[18px] bg-sage p-5">
          <div className="text-[12px] text-surface/85">활동 중인 회원</div>
          <div className="mt-2 flex items-end gap-2">
            <span className="serif text-[36px] leading-none text-surface">
              {ov.activeMembers.toLocaleString()}명
            </span>
            {ov.newThisMonth > 0 ? (
              <span className="pb-0.5 text-[13px] font-semibold text-[#CDE0CF]">
                이번 달 신규 {ov.newThisMonth}명
              </span>
            ) : null}
          </div>
        </div>

        {/* three stat cards */}
        <div className="mb-2.5 flex gap-2.5">
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={ov.weekClasses} label="이번 주 수업" />
          </Card>
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={`${ov.attendRate}%`} label="출석률" color="text-sage-deep" />
          </Card>
          <Card className="flex-1 px-3.5 py-3">
            <Stat value={`${ov.trainerCount}명`} label="트레이너" color="text-sage-soft" />
          </Card>
        </div>

        {/* weekly chart */}
        <Card className="mb-2.5 p-4">
          <div className="mb-3.5 flex items-center justify-between">
            <span className="text-[13.5px] font-bold text-ink">주간 수업</span>
            <span className="text-[12px] font-medium text-muted">{ov.weekClasses}타임</span>
          </div>
          <BarChart bars={ov.weeklyBars} />
        </Card>

        {/* retention banner — people-centric, no ₩ */}
        {ov.expiringCount > 0 ? (
          <Link
            href="/t/retention"
            className="tappable flex items-center gap-2.5 rounded-[16px] border border-terracotta/[0.18] bg-warm-banner px-4 py-[15px]"
          >
            <Icon name="refresh" size={20} className="text-terracotta" />
            <div className="flex-1">
              <div className="text-[13.5px] font-bold text-terracotta-deep">재등록 관리가 필요한 회원</div>
              <div className="mt-0.5 text-[12px] text-terracotta-text">만료 임박 {ov.expiringCount}명</div>
            </div>
            <Icon name="chevron-right" size={16} className="text-terracotta" />
          </Link>
        ) : null}

        <div className="h-3.5" />
      </Body>

      <TabBar tabs={trainerTabs({ isOwner, chatUnread })} liveChat />
    </div>
  );
}
```

- [ ] **Step 3: ₩ 미포함 + 빌드 확인**

```bash
grep -n "₩\|revenue\|매출\|예상" "src/app/(app)/t/perf/page.tsx"
```
Expected: 출력 없음.

Run: `bun run build`
Expected: 성공.

- [ ] **Step 4: 시각/수동 검증 (대표 계정)**

`run` 또는 `verify` 스킬로 앱을 띄워 대표 계정으로 `/t/perf` 진입 후 확인:
- 하단 탭에 "운영" + home 아이콘, 활성 시 home-fill.
- 화면에 ₩/금액 표기 0회.
- 히어로 "활동 중인 회원 N명" + (신규>0이면) "이번 달 신규 N명".
- stat 3종(이번 주 수업/출석률/트레이너) 라벨이 한 줄로 깔끔하게 들어가는지(특히 "이번 주 수업").
- 차트 헤더 "N타임" = 막대 합과 일치.
- 만료 임박이 있으면 배너 노출(금액 없음), 없으면 배너 숨김.
- 배너 탭 → `/t/retention`이 owner 기준 전체 회원으로 뜨는지.

- [ ] **Step 5: 커밋**

```bash
git add src/components/trainer/tabs.ts "src/app/(app)/t/perf/page.tsx"
git commit -m "feat(ops): 실적 탭 → 운영 현황 (studio-wide, money-free)"
```

---

## Self-Review (작성자 점검 결과)

**Spec coverage:**
- 탭 "운영"/home → Task 4. 제목 "운영 현황" → Task 4. 매출 완전 제거 → Task 4(+grep 게이트).
- 스튜디오 전체 범위 → Task 2(`getStudioOverview`). 사람 중심 히어로/stat → Task 4.
- `getPerf` 제거 → Task 3. 재등록 owner 전체 확장 → Task 3. 배너 금액 제거 → Task 4.
- KST 월/주 경계(월~토, 단일 진실 공급원) → Task 1(테스트 포함).
- 엣지(빈 데이터 0/100, 만료 0명 배너 숨김) → Task 2 null 가드 + Task 4 조건부 렌더.

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. "적절히 처리" 류 없음.

**Type consistency:** `StudioOverview` 필드명(activeMembers/newThisMonth/weekClasses/attendRate/
trainerCount/weeklyBars/expiringCount)이 Task 2 정의와 Task 4 사용처에서 동일. `buildWeeklyBars`
시그니처(number[] → PerfBar[]) Task 2 내부 일관. `getStudioOverview`/`getRetention` 반환 타입
일치. db 래퍼명(`monthBoundsKst`/`weekBoundsKst`/`currentMonthLabel`) Task 1 정의 = Task 2 소비 동일.
