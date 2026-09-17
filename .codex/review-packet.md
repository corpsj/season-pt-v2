# GPT Pro Review Request

You are reviewing an existing local project.

You cannot see my computer, repository, terminal, git history, previous agent actions, browser state, database state, generated files, runtime logs, or hidden files.

All relevant context is included below.

Do not assume context that is not shown.

Return only this exact format:

```text
VERDICT: PASS | REVISE

CONTEXT_GAPS:

- ...

MUST_FIX:

- ...

OPTIONAL:

- ...

TESTS_TO_RUN:

- ...

RISK_NOTES:

- ...
```

---

## 1. Active Task

### Original Request

`/goal 완성도를 개선해줘` / `남은 작업들을 끝까지 계속해. 강사 최초로그인시 임시비밀번호 추가하는건 하지마. 지금처럼 최초로그인은 전화번호로 하게 둬.`

### Active Task Brief

Audit and finish product-completeness work across auth, schedule integrity, maintenance safety, error states, and accessibility. Preserve phone-only trainer first login exactly as requested.

### Inferred Goal

Ship a production-buildable, failure-aware PT studio app whose critical mutations are race-safe and whose public/mobile UI has basic recovery and accessibility coverage.

### Non-Goals

- Do not add a trainer first-login temporary-password field or delivery flow.
- Do not deploy, push, commit, or mutate the production Supabase database.
- Do not redesign authenticated product screens wholesale.

### Constraints

- Next.js 16.2.9 behavior must follow repository-local docs.
- Preserve unrelated user changes and the existing phone-only first login.
- Migration 0026 must precede application deployment.

---

## 2. Project Snapshot

### Purpose

Korean PT/Pilates operations product with trainer/mobile member apps and a desktop owner console.

### Stack

Next.js 16.2.9 App Router, React 19.2, TypeScript 5, Tailwind 4, Bun, Supabase/PostgreSQL.

### Package Manager And Commands

- `bun run lint`
- `bun test`
- `bunx tsc --noEmit --incremental false`
- `bun run build`
- `bash scripts/deploy-prod.sh <migration...>`

### Important Routes, Modules, Or Directories

- `src/app/(app)/m`, `src/app/(app)/t`, `src/app/console`
- `src/lib/auth/context.ts`, member/trainer auth actions
- `src/lib/data/groups/scheduling-actions.ts`, `member-actions.ts`, `session-mutations.ts`
- `supabase/migrations/0026_schedule_request_integrity.sql`
- shared UI primitives under `src/components/ui` and shell components

### Relevant Architecture

Server Components and Server Actions use a service-role Supabase client. Authorization therefore lives in request-cached server contexts and explicit action guards. Schedule mutations are delegated to restricted `security invoker` RPCs for transaction boundaries.

### Database, Storage, Or External Services

Supabase Auth/Postgres/Storage. Production DB was not changed. Migration/RPC behavior was exercised in an isolated PostgreSQL 15 container.

---

## 3. Work So Far

### Current State

Implementation and validation are complete. No known build, type, lint, test, SQL, HTTP, or visual QA failure remains.

### Changes Made

- Split raw setup trainer context from operational trainer context. A phone-only first-login session can reach credential setup but cannot call normal trainer actions.
- Reject inactive member logins and stale signed member cookies; add database-backed member/trainer layouts.
- Fail maintenance closed on missing/wrong cron secret; deployment env setup now fails visibly.
- Validate signatures, future attendance/date changes, exact confirmation request authorization, and display true member session type.
- Add migration 0026: exact accepted slot, one pending request per session, transaction-safe move/tombstone/request resolution, trainer-row serialization for overlap checks, transaction-safe cancel/deduction/ledger.
- Add public/app/console/global error recovery and production-only `/dev` blocking.
- Improve dialog focus management, touch targets, keyboard focus, reduced motion, and ARIA semantics.

### Reasoning For Changes

The highest-impact audit failures were stale authorization, fail-open maintenance, future/unsigned mutations, inaccurate confirmations, and multi-actor schedule races. Database transactions are used where application-level compensating writes could split state.

### Unresolved Questions

- Whether the business will later accept stronger first-login identity verification. The current phone-only flow is an explicit user decision.

### Known Risks

- Migration-first deployment is mandatory because application code calls new RPCs/column immediately.
- Authenticated E2E against production-like Supabase credentials was not authorized/run.

---

## 4. Repository State

### Current Branch

`main` tracking `origin/main`.

### Recent Commits, If Relevant

No commit was created in this task.

### Git Status

```text
Modified: deployment setup, auth context/member auth, scheduling/member data and actions,
confirmation/member/trainer/console UI, shared UI primitives, globals, and types.
Added: error/not-found boundaries, member/trainer/dev layouts, cron/scheduling guards+tests,
migration 0026, .codex state/review/QA evidence.
```

### Changed Files

```text
scripts/setup-deploy.sh
src/app/(app)/{confirm,m,my,page,set-password,t}/...
src/app/{api/maintenance,console,dev,global-error,not-found}/...
src/components/{shell,ui}/...
src/lib/auth/{context,member-actions,cron-auth*}.ts
src/lib/data/groups/{member,member-actions,scheduling,scheduling-actions,session-mutations}.ts
src/lib/data/scheduling-guards*.ts
src/lib/types.ts
supabase/migrations/0026_schedule_request_integrity.sql
.codex/{state.md,review-packet.md,qa/...}
```

### Git Diff

```diff
32 tracked files: 572 insertions, 288 deletions, plus the new boundaries, layouts,
pure guard tests, migration, and QA documents listed above.

Critical diff contracts:
- getTrainerSetupContext returns valid setup sessions; getTrainerContext returns null while mustChangePassword.
- moveSessionWithTombstone calls move_session_with_tombstone_atomic.
- acceptCancelRequestAtomic calls accept_cancel_request_atomic and returns low-session notification data.
- both member and trainer change/cancel acceptance paths delegate the state transition to those RPCs.
- /login/instructor and trainerFirstLogin have no task diff and remain phone-only.
```

### Relevant File Excerpts

- `move_session_with_tombstone_atomic`: locks request, session, then trainer; rechecks 60-minute overlap; moves and creates tombstone; accepts exact slot; rejects other pending requests; all within one function transaction.
- `accept_cancel_request_atomic`: locks request/session; cancels; optionally locks/decrements earliest-expiring active membership; inserts attendance ledger; resolves requests; returns deductions.
- Both functions are `security invoker`, PUBLIC execute is revoked, and only `service_role` receives execute.

---

## 5. Validation State

### Commands Run

```text
git diff --check
bun run lint
bun test
bunx tsc --noEmit --incremental false
bun run build
bash -n scripts/setup-deploy.sh scripts/deploy-prod.sh
PostgreSQL 15 migration and RPC scenario checks
next start -p 3100 + curl/browser QA
```

### Test, Lint, Build, Or Typecheck Output

```text
ESLint: PASS, no warnings
Bun: 72 pass / 0 fail / 162 expect calls
TypeScript: PASS
Next build: compiled, TypeScript passed, 58/58 static pages generated
Shell syntax: PASS
Diff check: PASS
PostgreSQL: 0026 functions/index/privileges created; move/conflict/tombstone/cancel/deduction/ledger scenarios PASS
HTTP: /dev 404; /login/instructor 200; unknown route 404
```

### Browser, Screenshot, Or Playwright Findings

- 390×844 production phone-first-login screen contains only phone input and no temporary-password input.
- 390×844 404 and 1440×900 console login have no visible clipping/overflow or console errors.
- 700×900 component catalog shows 44px calendar cells and non-overlapping controls.
- A11y snapshots expose full date names, pressed/current states, named groups, progress bars, and switches.
- Evidence is stored under `.codex/qa/completeness-2026-07-10/final-*`.

### Current Failures

None.

### Suspected Causes

Not applicable.

---

## 6. Review Questions

Review the current implementation as if this packet is the only context available.

Focus on:

- correctness
- regressions
- edge cases
- missing tests
- type errors
- build failures
- integration risks
- data migration risks
- admin, permission, or security issues
- unnecessary complexity
- visual or UX issues if rendered surfaces changed

Only put concrete required changes under `MUST_FIX`.

Put non-blocking improvements under `OPTIONAL`.

Do not request broad rewrites unless the current approach is clearly wrong.

Do not assume files, requirements, or behavior not shown in this packet.
