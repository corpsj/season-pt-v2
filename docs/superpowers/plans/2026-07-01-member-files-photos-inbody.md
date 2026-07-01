# 회원 첨부파일 (진행 사진 · 인바디 PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 강사가 회원별 진행 사진과 인바디 PDF를 업로드하고, 회원·대표가 열람하는 기능을 비공개 저장소 위에 구축한다.

**Architecture:** Supabase Storage 비공개 버킷(`member-files`) + `member_files` 단일 테이블(`kind`로 사진/인바디 구분). 모든 접근은 서버 액션/getter가 호출자(강사 `getTrainerContext` / 회원 `getMemberContext`)를 검증한 뒤 짧은 수명 서명 URL을 발급한다. 회원은 Supabase Auth 사용자가 아니므로 RLS가 아닌 코드 레벨 권한 검증에 의존한다.

**Tech Stack:** Next.js(App Router, Server Actions) · React · Supabase(Storage + Postgres, 서비스롤 admin 클라이언트) · Bun · Tailwind.

## Global Constraints

- 런타임/도구: Node 대신 **Bun** (`bun test`, `bun run`, `bunx`). dotenv 금지(Bun 자동 로드).
- 내부 사고는 영어, 사용자 노출 문구/카피는 **한국어**.
- 이 저장소의 Next.js는 학습 데이터와 다를 수 있음 — 새 설정/API 전에 `node_modules/next/dist/docs/` 확인(AGENTS.md).
- 서비스롤 클라이언트 `sb`(`src/lib/data/db.ts`)는 RLS를 우회하므로 **클라이언트 코드에서 절대 import 금지**. 권한은 서버 액션 안에서 context로 검증.
- 배포: 코드 준비되면 `git push origin membership-lifecycle` 후 `bash scripts/deploy-prod.sh`. 마이그레이션 동반 시 인자로 전달.
- 커밋 트레일러: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`
- 앱은 라이트 전용 · 모바일 우선 PWA. 신규 UI는 기존 컴포넌트(`Card`, `Icon`, `useToast`, `Body`/`Footer`) 재사용.
- 민감정보: 신체 사진 — 버킷은 비공개 유지, 공개 URL 금지.

---

## File Structure

**신규**
- `supabase/migrations/0012_member_files.sql` — enum + 테이블 + 비공개 버킷.
- `src/lib/media/upload-guard.ts` — 순수 헬퍼(`fitDimensions`, `validateUpload`, 상수). 서버·클라이언트 공용.
- `src/lib/media/upload-guard.test.ts` — 위 순수 헬퍼 단위 테스트.
- `src/lib/media/downscale.ts` — 브라우저 전용 이미지 다운스케일(`downscaleImage`).
- `src/lib/data/groups/member-files.ts` — 서버 getter(`getMemberFiles`, `getMyFiles`) + 공유 권한/서명 헬퍼.
- `src/lib/data/groups/member-files-actions.ts` — `"use server"` 액션(`uploadMemberFile`, `deleteMemberFile`, `listMemberFiles`).
- `src/app/(app)/t/members/[id]/MemberFilesSection.tsx` — 강사용 클라이언트 섹션(업로드·삭제·갤러리).
- `src/app/(app)/m/my/body/page.tsx` — 회원 열람 페이지(읽기 전용).

**수정**
- `next.config.ts` — `serverActions.bodySizeLimit` 상향.
- `src/app/(app)/t/members/[id]/page.tsx` — 사진·인바디 섹션 삽입.
- `src/app/(app)/m/my/ui.tsx` — 메뉴 링크 추가.
- `src/app/console/members/ui.tsx` — 대표 콘솔 상세 패널 열람 섹션.

---

## Task 1: 마이그레이션 + 서버 액션 본문 크기 설정

**Files:**
- Create: `supabase/migrations/0012_member_files.sql`
- Modify: `next.config.ts`

**Interfaces:**
- Produces: 테이블 `member_files(id, member_id, kind, storage_path, note, taken_at, created_by, created_at)`, enum `member_file_kind('photo'|'inbody')`, 비공개 버킷 `member-files`.

- [ ] **Step 1: 마이그레이션 파일 작성**

`supabase/migrations/0012_member_files.sql`:

```sql
-- 회원 첨부파일: 진행 사진 + 인바디 PDF (비공개 버킷 + 코드 레벨 권한)
create type member_file_kind as enum ('photo', 'inbody');

create table if not exists member_files (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  kind member_file_kind not null,
  storage_path text not null,
  note text,
  taken_at date not null default current_date,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_member_files_member on member_files(member_id, kind, taken_at desc);

-- 비공개 버킷(모든 접근은 서버 서명 URL 경유)
insert into storage.buckets (id, name, public)
values ('member-files', 'member-files', false)
on conflict (id) do nothing;
```

- [ ] **Step 2: Next 문서에서 bodySizeLimit 설정법 확인**

Run: `ls node_modules/next/dist/docs/ && grep -rl "bodySizeLimit\|serverActions" node_modules/next/dist/docs/ | head`
확인: `experimental.serverActions.bodySizeLimit` 키가 이 버전에서 유효한지, 값 형식(`"10mb"`)이 맞는지. 다르면 문서에 맞춰 다음 스텝을 조정.

- [ ] **Step 3: next.config.ts 수정 — 본문 크기 상향**

`experimental` 블록에 `serverActions` 추가(기존 `staleTimes` 유지):

```ts
  experimental: {
    staleTimes: { dynamic: 60, static: 300 },
    // 인바디 PDF 업로드(최대 10MB)를 서버 액션으로 받기 위해 상향. 기본값(1MB)은 부족.
    serverActions: { bodySizeLimit: "10mb" },
  },
```

- [ ] **Step 4: 빌드로 설정 유효성 확인**

Run: `bun run build 2>&1 | tail -5`
Expected: 빌드 성공(설정 키가 유효하면 경고 없이 통과). 경고가 나오면 Step 2 문서대로 키 위치 조정.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0012_member_files.sql next.config.ts
git commit -m "feat(files): member_files 스키마·버킷 + 서버액션 본문 10MB 상향

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> 마이그레이션 운영 적용은 Task 7(배포)에서 일괄 수행. 로컬 Supabase가 있으면 여기서 `bash scripts/deploy-prod.sh supabase/migrations/0012_member_files.sql` 대신 로컬 적용해 확인해도 됨.

---

## Task 2: 순수 업로드 가드 + 이미지 다운스케일 (TDD)

**Files:**
- Create: `src/lib/media/upload-guard.ts`
- Test: `src/lib/media/upload-guard.test.ts`
- Create: `src/lib/media/downscale.ts`

**Interfaces:**
- Produces:
  - `type FileKind = "photo" | "inbody"`
  - `MAX_UPLOAD_BYTES: number` (10MB)
  - `fitDimensions(w: number, h: number, max: number): { w: number; h: number }`
  - `validateUpload(kind: FileKind, mime: string, size: number): { ok: true } | { ok: false; error: string }`
  - `downscaleImage(file: File, maxPx?: number, quality?: number): Promise<Blob>` (브라우저 전용)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/media/upload-guard.test.ts`:

```ts
import { test, expect } from "bun:test";
import { fitDimensions, validateUpload, MAX_UPLOAD_BYTES } from "./upload-guard";

test("fitDimensions: 작은 이미지는 그대로", () => {
  expect(fitDimensions(800, 600, 1600)).toEqual({ w: 800, h: 600 });
});
test("fitDimensions: 가로가 긴 이미지는 긴 변 기준 축소", () => {
  expect(fitDimensions(3200, 2400, 1600)).toEqual({ w: 1600, h: 1200 });
});
test("fitDimensions: 세로가 긴 이미지는 긴 변 기준 축소", () => {
  expect(fitDimensions(2400, 3200, 1600)).toEqual({ w: 1200, h: 1600 });
});
test("validateUpload: 용량 초과 거부", () => {
  expect(validateUpload("photo", "image/jpeg", MAX_UPLOAD_BYTES + 1).ok).toBe(false);
});
test("validateUpload: 잘못된 MIME 거부", () => {
  expect(validateUpload("inbody", "image/png", 1000).ok).toBe(false);
  expect(validateUpload("photo", "application/pdf", 1000).ok).toBe(false);
});
test("validateUpload: 정상 통과", () => {
  expect(validateUpload("photo", "image/jpeg", 1000).ok).toBe(true);
  expect(validateUpload("inbody", "application/pdf", 1000).ok).toBe(true);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `bun test src/lib/media/upload-guard.test.ts`
Expected: FAIL (`Cannot find module './upload-guard'`).

- [ ] **Step 3: 순수 헬퍼 구현**

`src/lib/media/upload-guard.ts`:

```ts
export type FileKind = "photo" | "inbody";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10MB

/** (w,h)를 종횡비 유지한 채 긴 변이 max 이하가 되도록 축소. 이미 작으면 그대로. */
export function fitDimensions(w: number, h: number, max: number): { w: number; h: number } {
  const longest = Math.max(w, h);
  if (longest <= max) return { w, h };
  const scale = max / longest;
  return { w: Math.round(w * scale), h: Math.round(h * scale) };
}

/** 저장소에 닿기 전 업로드 검증. 순수 함수 — 서버·클라이언트 공용. */
export function validateUpload(
  kind: FileKind,
  mime: string,
  size: number,
): { ok: true } | { ok: false; error: string } {
  if (size > MAX_UPLOAD_BYTES) return { ok: false, error: "파일이 너무 커요 (최대 10MB)" };
  if (kind === "photo" && !mime.startsWith("image/")) return { ok: false, error: "이미지 파일만 올릴 수 있어요" };
  if (kind === "inbody" && mime !== "application/pdf") return { ok: false, error: "PDF 파일만 올릴 수 있어요" };
  return { ok: true };
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `bun test src/lib/media/upload-guard.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: 브라우저 다운스케일 헬퍼 구현**

`src/lib/media/downscale.ts`:

```ts
import { fitDimensions } from "./upload-guard";

/**
 * 이미지 File을 긴 변 ≤ maxPx의 JPEG Blob으로 축소. 브라우저 전용(canvas 사용).
 * 실패 시 원본 File을 그대로 반환한다.
 */
export async function downscaleImage(file: File, maxPx = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const { w, h } = fitDimensions(bitmap.width, bitmap.height, maxPx);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    return await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b ?? file), "image/jpeg", quality),
    );
  } catch {
    return file; // 축소 불가 시 원본 업로드
  }
}
```

- [ ] **Step 6: 타입체크 + Commit**

Run: `bunx tsc --noEmit 2>&1 | grep media || echo ok`
Expected: `ok`

```bash
git add src/lib/media/upload-guard.ts src/lib/media/upload-guard.test.ts src/lib/media/downscale.ts
git commit -m "feat(files): 업로드 검증·이미지 다운스케일 헬퍼 (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: 데이터 계층 — getter + 서버 액션

**Files:**
- Create: `src/lib/data/groups/member-files.ts`
- Create: `src/lib/data/groups/member-files-actions.ts`

**Interfaces:**
- Consumes: `sb`, `getTrainerContext`, `getMemberContext` from `@/lib/data/db`; `validateUpload`, `FileKind` from `@/lib/media/upload-guard`.
- Produces:
  - `type MemberFileView = { id: string; kind: FileKind; url: string | null; note: string | null; takenAt: string }`
  - `trainerCanAccess(memberId: string): Promise<{ trainerId: string } | null>`
  - `getMemberFiles(memberId: string, kind?: FileKind): Promise<MemberFileView[]>`
  - `getMyFiles(kind?: FileKind): Promise<MemberFileView[]>`
  - 액션: `uploadMemberFile(formData: FormData): Promise<{ ok: boolean; error?: string }>`
  - 액션: `deleteMemberFile(fileId: string): Promise<{ ok: boolean; error?: string }>`
  - 액션: `listMemberFiles(memberId: string, kind?: FileKind): Promise<MemberFileView[]>`

- [ ] **Step 1: getter 모듈 작성**

`src/lib/data/groups/member-files.ts`:

```ts
import "server-only";
import { sb, getTrainerContext, getMemberContext } from "@/lib/data/db";
import type { FileKind } from "@/lib/media/upload-guard";

export const FILES_BUCKET = "member-files";
const SIGNED_TTL = 60 * 60; // 1시간

export type MemberFileView = {
  id: string;
  kind: FileKind;
  url: string | null;
  note: string | null;
  takenAt: string; // YYYY-MM-DD
};

async function signedUrlFor(path: string): Promise<string | null> {
  const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

/** 대표는 전체, 강사는 담당 회원만. 접근 가능하면 { trainerId } 반환, 아니면 null. */
export async function trainerCanAccess(memberId: string): Promise<{ trainerId: string } | null> {
  const t = await getTrainerContext();
  if (!t) return null;
  if (t.role === "owner") return { trainerId: t.id };
  const { data } = await sb
    .from("member_trainers")
    .select("member_id")
    .eq("member_id", memberId)
    .eq("trainer_id", t.id)
    .maybeSingle();
  return data ? { trainerId: t.id } : null;
}

async function listFiles(memberId: string, kind?: FileKind): Promise<MemberFileView[]> {
  let q = sb
    .from("member_files")
    .select("id, kind, storage_path, note, taken_at")
    .eq("member_id", memberId)
    .order("taken_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return Promise.all(
    (data ?? []).map(async (r) => ({
      id: r.id as string,
      kind: r.kind as FileKind,
      url: await signedUrlFor(r.storage_path as string),
      note: (r.note as string | null) ?? null,
      takenAt: r.taken_at as string,
    })),
  );
}

/** 강사/대표 열람. 권한 없으면 빈 배열. */
export async function getMemberFiles(memberId: string, kind?: FileKind): Promise<MemberFileView[]> {
  if (!(await trainerCanAccess(memberId))) return [];
  return listFiles(memberId, kind);
}

/** 회원 본인 열람. */
export async function getMyFiles(kind?: FileKind): Promise<MemberFileView[]> {
  const me = await getMemberContext();
  if (!me) return [];
  return listFiles(me.memberId, kind);
}
```

- [ ] **Step 2: 서버 액션 모듈 작성**

`src/lib/data/groups/member-files-actions.ts`:

```ts
"use server";
import { revalidatePath } from "next/cache";
import { sb } from "@/lib/data/db";
import { validateUpload, type FileKind } from "@/lib/media/upload-guard";
import { FILES_BUCKET, getMemberFiles, trainerCanAccess } from "./member-files";

type Result = { ok: boolean; error?: string };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** 강사(담당) 또는 대표가 회원에 사진/인바디 파일을 업로드. */
export async function uploadMemberFile(formData: FormData): Promise<Result> {
  const memberId = String(formData.get("memberId") ?? "");
  const kind = String(formData.get("kind") ?? "") as FileKind;
  const note = (formData.get("note") as string | null)?.trim() || null;
  const takenAt = (formData.get("takenAt") as string | null) || null;
  const file = formData.get("file");

  if (!memberId || (kind !== "photo" && kind !== "inbody")) return { ok: false, error: "잘못된 요청이에요" };
  if (!(file instanceof File)) return { ok: false, error: "파일이 없어요" };

  const access = await trainerCanAccess(memberId);
  if (!access) return { ok: false, error: "권한이 없어요" };

  const v = validateUpload(kind, file.type, file.size);
  if (!v.ok) return { ok: false, error: v.error };

  const ext = EXT[file.type] ?? (kind === "inbody" ? "pdf" : "jpg");
  const path = `${memberId}/${kind}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(FILES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: "업로드에 실패했어요" };

  const row: Record<string, unknown> = {
    member_id: memberId,
    kind,
    storage_path: path,
    note,
    created_by: access.trainerId,
  };
  if (takenAt) row.taken_at = takenAt;

  const { error: insErr } = await sb.from("member_files").insert(row);
  if (insErr) {
    await sb.storage.from(FILES_BUCKET).remove([path]); // 고아 객체 롤백
    return { ok: false, error: "저장에 실패했어요" };
  }

  revalidatePath(`/t/members/${memberId}`);
  revalidatePath("/m/my/body");
  return { ok: true };
}

/** 강사(담당)/대표가 파일 삭제 — Storage 객체와 행을 함께 제거. */
export async function deleteMemberFile(fileId: string): Promise<Result> {
  const { data: row } = await sb
    .from("member_files")
    .select("member_id, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!row) return { ok: false, error: "파일을 찾을 수 없어요" };
  if (!(await trainerCanAccess(row.member_id as string))) return { ok: false, error: "권한이 없어요" };

  await sb.storage.from(FILES_BUCKET).remove([row.storage_path as string]);
  await sb.from("member_files").delete().eq("id", fileId);

  revalidatePath(`/t/members/${row.member_id as string}`);
  revalidatePath("/m/my/body");
  return { ok: true };
}

/** 대표 콘솔(클라이언트)에서 회원 선택 시 파일 조회 — getMemberFiles가 권한 검증. */
export async function listMemberFiles(memberId: string, kind?: FileKind): Promise<Awaited<ReturnType<typeof getMemberFiles>>> {
  return getMemberFiles(memberId, kind);
}
```

- [ ] **Step 3: 타입체크**

Run: `bunx tsc --noEmit 2>&1 | grep -E "member-files" || echo ok`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add src/lib/data/groups/member-files.ts src/lib/data/groups/member-files-actions.ts
git commit -m "feat(files): member_files getter·업로드/삭제 서버 액션 (서명 URL·권한 검증)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 강사 회원상세 — 업로드/갤러리 섹션

**Files:**
- Create: `src/app/(app)/t/members/[id]/MemberFilesSection.tsx`
- Modify: `src/app/(app)/t/members/[id]/page.tsx`

**Interfaces:**
- Consumes: `uploadMemberFile`, `deleteMemberFile` from `@/lib/data/groups/member-files-actions`; `getMemberFiles`, `MemberFileView` from `@/lib/data/groups/member-files`; `downscaleImage` from `@/lib/media/downscale`; `useToast`, `Icon`, `Card`.
- Produces: `<MemberFilesSection kind memberId initial />` 클라이언트 컴포넌트.

- [ ] **Step 1: 클라이언트 섹션 컴포넌트 작성**

`src/app/(app)/t/members/[id]/MemberFilesSection.tsx`:

```tsx
"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/Toast";
import { downscaleImage } from "@/lib/media/downscale";
import { uploadMemberFile, deleteMemberFile } from "@/lib/data/groups/member-files-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";

const CFG = {
  photo: { title: "진행 사진", icon: "camera", accept: "image/*", capture: true, empty: "아직 사진이 없어요" },
  inbody: { title: "인바디", icon: "document-text", accept: "application/pdf", capture: false, empty: "아직 인바디 결과가 없어요" },
} as const;

export function MemberFilesSection({
  kind,
  memberId,
  initial,
}: {
  kind: "photo" | "inbody";
  memberId: string;
  initial: MemberFileView[];
}) {
  const cfg = CFG[kind];
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [, refresh] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // 같은 파일 재선택 허용
    if (!file || busy) return;
    setBusy(true);
    try {
      const blob = kind === "photo" ? await downscaleImage(file) : file;
      const fd = new FormData();
      fd.set("memberId", memberId);
      fd.set("kind", kind);
      fd.set("file", blob, kind === "photo" ? "photo.jpg" : file.name);
      const r = await uploadMemberFile(fd);
      if (!r.ok) toast(r.error ?? "업로드에 실패했어요");
      else {
        toast(kind === "photo" ? "사진을 저장했어요" : "인바디를 저장했어요");
        refresh(() => router.refresh());
      }
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(id: string) {
    if (busy) return;
    setBusy(true);
    const r = await deleteMemberFile(id);
    setBusy(false);
    if (!r.ok) toast(r.error ?? "삭제에 실패했어요");
    else refresh(() => router.refresh());
  }

  return (
    <Card className="mb-3.5 px-4 py-[14px]">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-muted5">{cfg.title}</span>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg bg-sage px-2.5 py-1.5 text-[12px] font-semibold text-surface disabled:opacity-50"
        >
          <Icon name={cfg.icon} size={13} />
          {busy ? "올리는 중…" : "추가"}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={cfg.accept}
          {...(cfg.capture ? { capture: "environment" as const } : {})}
          className="hidden"
          onChange={onPick}
        />
      </div>

      {initial.length === 0 ? (
        <div className="py-4 text-center text-[12.5px] font-medium text-muted">{cfg.empty}</div>
      ) : kind === "photo" ? (
        <div className="grid grid-cols-3 gap-2">
          {initial.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
              {f.url ? (
                <a href={f.url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                </a>
              ) : null}
              <button
                onClick={() => onDelete(f.id)}
                className="absolute right-1 top-1 rounded-full bg-ink/60 p-1 text-surface"
                aria-label="삭제"
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-ink/[0.06]">
          {initial.map((f) => (
            <div key={f.id} className="flex items-center gap-2 py-2.5">
              <Icon name="document-text" size={16} className="flex-none text-sage" />
              <a href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex-1 truncate text-[13px] font-semibold text-ink">
                인바디 · {f.takenAt.replace(/-/g, ".")}
              </a>
              <button onClick={() => onDelete(f.id)} className="flex-none text-muted" aria-label="삭제">
                <Icon name="close" size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
```

> `capture`/`icon` 문자열이 각 컴포넌트의 타입과 맞는지 확인. `Icon`의 `name`은 `IconName` 유니온 — `camera`, `document-text`, `close`는 존재함(icon-data 확인됨). `capture`는 표준 input 속성이나 React 타입에서 문자열 허용.

- [ ] **Step 2: 회원상세 페이지에 섹션 삽입 + 데이터 로드**

`src/app/(app)/t/members/[id]/page.tsx` 수정:

1) import 추가:
```tsx
import { MemberFilesSection } from "./MemberFilesSection";
import { getMemberFiles } from "@/lib/data/groups/member-files";
```

2) 데이터 로드 — 기존 `Promise.all`에 사진·인바디 추가:
```tsx
  const [m, recordHref, me, photos, inbodies] = await Promise.all([
    getMemberDetail(id),
    getMemberRecordHref(id),
    getMe(),
    getMemberFiles(id, "photo"),
    getMemberFiles(id, "inbody"),
  ]);
```

3) 체성분 `Card`(체중/골격근/체지방) **바로 아래**에 두 섹션 삽입:
```tsx
        <MemberFilesSection kind="photo" memberId={id} initial={photos} />
        <MemberFilesSection kind="inbody" memberId={id} initial={inbodies} />
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `bunx tsc --noEmit 2>&1 | grep -E "members/\[id\]|MemberFiles" || echo ok`
Expected: `ok`
Run: `bun run build 2>&1 | tail -3`
Expected: 빌드 성공.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/t/members/[id]/MemberFilesSection.tsx" "src/app/(app)/t/members/[id]/page.tsx"
git commit -m "feat(files): 강사 회원상세 진행 사진·인바디 업로드/갤러리 섹션

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 회원 열람 페이지 + 메뉴 링크

**Files:**
- Create: `src/app/(app)/m/my/body/page.tsx`
- Modify: `src/app/(app)/m/my/ui.tsx`

**Interfaces:**
- Consumes: `getMyFiles` from `@/lib/data/groups/member-files`; `Body`, `BackButton`, `Card`, `EmptyState`, `Icon`.

- [ ] **Step 1: 회원 열람 페이지 작성 (읽기 전용)**

`src/app/(app)/m/my/body/page.tsx`:

```tsx
import { Body } from "@/components/shell/Body";
import { BackButton } from "@/components/shell/BackButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Icon } from "@/components/ui/icon";
import { getMyFiles } from "@/lib/data/groups/member-files";

export default async function MemberBodyPage() {
  const [photos, inbodies] = await Promise.all([getMyFiles("photo"), getMyFiles("inbody")]);

  return (
    <div className="scr flex min-h-0 flex-1 flex-col">
      <Body>
        <div className="mb-[18px] flex items-center gap-3 px-0.5">
          <BackButton fallback="/m/my" />
          <span className="whitespace-nowrap text-[19px] font-bold tracking-[-0.01em] text-ink">체형 기록</span>
        </div>

        {photos.length === 0 && inbodies.length === 0 ? (
          <EmptyState icon="camera" title="아직 기록이 없어요" desc="수업 때 선생님이 진행 사진과 인바디를 남겨드려요." />
        ) : (
          <>
            <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">진행 사진</div>
            {photos.length === 0 ? (
              <Card className="mb-4 py-4 text-center text-[12.5px] font-medium text-muted">아직 사진이 없어요</Card>
            ) : (
              <div className="mb-4 grid grid-cols-3 gap-2">
                {photos.map((f) =>
                  f.url ? (
                    <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-xl bg-ink/[0.04]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                    </a>
                  ) : null,
                )}
              </div>
            )}

            <div className="mb-2.5 px-0.5 text-[12.5px] font-semibold text-muted5">인바디</div>
            {inbodies.length === 0 ? (
              <Card className="py-4 text-center text-[12.5px] font-medium text-muted">아직 인바디 결과가 없어요</Card>
            ) : (
              <Card className="divide-y divide-ink/[0.06] px-4 py-1">
                {inbodies.map((f) => (
                  <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-3">
                    <Icon name="document-text" size={16} className="flex-none text-sage" />
                    <span className="flex-1 truncate text-[13px] font-semibold text-ink">인바디 · {f.takenAt.replace(/-/g, ".")}</span>
                    <Icon name="chevron-right" size={16} className="flex-none text-muted" />
                  </a>
                ))}
              </Card>
            )}
          </>
        )}
        <div className="h-2" />
      </Body>
    </div>
  );
}
```

- [ ] **Step 2: 회원 마이페이지 메뉴에 링크 추가**

`src/app/(app)/m/my/ui.tsx` — "운동 기록" `MenuRow`(`href="/m/my/records"`) 바로 아래에 삽입:
```tsx
          <MenuRow icon="camera" label="체형 기록" href="/m/my/body" />
```

- [ ] **Step 3: 타입체크 + 빌드**

Run: `bunx tsc --noEmit 2>&1 | grep -E "m/my" || echo ok`
Expected: `ok`
Run: `bun run build 2>&1 | tail -3`
Expected: 빌드 성공(`/m/my/body` 라우트 등장).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/m/my/body/page.tsx" "src/app/(app)/m/my/ui.tsx"
git commit -m "feat(files): 회원 체형 기록 열람 페이지(사진·인바디) + 메뉴 링크

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 대표 콘솔 열람 섹션 (선택·저비용)

**Files:**
- Modify: `src/app/console/members/ui.tsx`

**Interfaces:**
- Consumes: `listMemberFiles` from `@/lib/data/groups/member-files-actions`; `MemberFileView`.

- [ ] **Step 1: import + 상태 추가**

`src/app/console/members/ui.tsx`:

1) import 추가:
```tsx
import { listMemberFiles } from "@/lib/data/groups/member-files-actions";
import type { MemberFileView } from "@/lib/data/groups/member-files";
```

2) 컴포넌트 상단 상태 추가(`detail` 상태 근처):
```tsx
  const [files, setFiles] = useState<MemberFileView[]>([]);
```

3) 회원 선택 시 파일 로드 — 기존 `select()`의 `startLoad` 콜백에 병렬 로드 추가:
```tsx
  function select(id: string) {
    setSelectedId(id);
    setFiles([]);
    startLoad(async () => {
      const [d, fs] = await Promise.all([loadMemberDetail(id), listMemberFiles(id)]);
      setDetail(d);
      setFiles(fs);
    });
  }
```
> 초기 선택분(`initialDetail`)은 파일이 비어 있다가 재선택 시 로드됨 — 첫 진입에도 필요하면 `page.tsx`에서 `listMemberFiles(initialId)`를 SSR로 전달해도 됨(선택).

- [ ] **Step 2: 상세 패널에 열람 섹션 렌더**

`d`(detail)가 있는 상세 `Card` 안, "회원권 이력" 위쪽 적절한 위치에 삽입:
```tsx
              {files.length > 0 ? (
                <>
                  <MicroLabel className="mb-2.5">사진 · 인바디</MicroLabel>
                  <div className="mb-[18px] grid grid-cols-4 gap-2">
                    {files.map((f) =>
                      f.url && f.kind === "photo" ? (
                        <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="aspect-square overflow-hidden rounded-[12px] bg-[#F1 EDE6]">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={f.url} alt={f.takenAt} className="h-full w-full object-cover" />
                        </a>
                      ) : (
                        <a key={f.id} href={f.url ?? "#"} target="_blank" rel="noreferrer" className="flex aspect-square flex-col items-center justify-center gap-1 rounded-[12px] bg-[#FBF7F1] text-center">
                          <Icon name="document-text" size={18} className="text-sage-deep" />
                          <span className="text-[10px] font-semibold text-[#766D60]">인바디</span>
                        </a>
                      ),
                    )}
                  </div>
                </>
              ) : null}
```
> 위 `bg-[#F1 EDE6]`의 공백은 오타 방지용 표시가 아님 — 실제로는 `bg-[#F1EDE6]`로 작성할 것.

- [ ] **Step 3: 타입체크 + 빌드**

Run: `bunx tsc --noEmit 2>&1 | grep -E "console/members" || echo ok`
Expected: `ok`
Run: `bun run build 2>&1 | tail -3`
Expected: 빌드 성공.

- [ ] **Step 4: Commit**

```bash
git add src/app/console/members/ui.tsx
git commit -m "feat(files): 대표 콘솔 회원 상세에 사진·인바디 열람 섹션

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 마이그레이션 적용 + 실기 검증 + 배포

**Files:** 없음(운영 작업).

- [ ] **Step 1: 전체 타입체크 + 빌드 최종 확인**

Run: `bunx tsc --noEmit && bun run build 2>&1 | tail -3`
Expected: 에러 없음, 빌드 성공.

- [ ] **Step 2: 푸시**

```bash
git push origin membership-lifecycle
```

- [ ] **Step 3: 마이그레이션 적용 + 배포**

Run: `bash scripts/deploy-prod.sh supabase/migrations/0012_member_files.sql`
Expected: `→ PROD DB 적용: supabase/migrations/0012_member_files.sql` 성공 로그 → Vercel 운영 배포 → `Aliased: https://season-pt.vercel.app`.

> 로컬 `supabase_db` 컨테이너가 없으면 스크립트가 안내대로 실패 — 그 경우 `mcp__claude_ai_Supabase__apply_migration` 또는 `new SQL(SUPABASE_DB_URL)`(`.env.deploy.local`, 프로젝트 ref `exdsrqjvjmakduufslif`)로 SQL 적용 후 `bash scripts/deploy-prod.sh`(인자 없이) 재실행.

- [ ] **Step 4: 실기 검증 (운영)**

데모 강사 로그인(`owner`/`test1234`) → 회원 상세에서:
1. 진행 사진 "추가" → 이미지 업로드 → 썸네일 표시 확인.
2. 인바디 "추가" → PDF 업로드 → 목록/열기 확인.
3. 삭제 동작 확인.
회원 데모(`윤채원` 01044010005/920217) 로그인 → `/m/my` → "체형 기록"에서 위 자료 열람 확인.
대표 콘솔 `/console/members` → 해당 회원 선택 → 사진·인바디 열람 확인.

- [ ] **Step 5: 검증 실패 시 대응**

업로드가 413/크기 오류면 Task 1 `bodySizeLimit` 적용 여부 재확인. 서명 URL 미표시면 버킷 비공개/경로/`createSignedUrl` TTL 확인. 권한 오류면 `trainerCanAccess`(담당 관계) 확인.

---

## Self-Review (작성자 점검 완료)

- **스펙 커버리지**: 저장소 기반(Task 1·3) / 진행 사진 업로드·열람(Task 4·5·6) / 인바디 PDF(Task 4·5·6) / 회원 양쪽 열람(Task 5, 회원 노출 "둘 다") / 대표 콘솔 열람(Task 6) / 다운스케일·용량·에러(Task 2·3·4) / 테스트(Task 2) / 배포·마이그레이션(Task 7) — 모두 태스크에 매핑됨.
- **플레이스홀더**: 없음(모든 코드 스텝에 실제 코드). Task 6의 `bg-[#F1EDE6]` 표기 주의 노트 포함.
- **타입 일관성**: `MemberFileView`, `FileKind`, `getMemberFiles`/`getMyFiles`/`listMemberFiles`, `uploadMemberFile`/`deleteMemberFile` 시그니처가 정의부(Task 3)와 소비부(Task 4·5·6)에서 일치.
- **범위**: 단일 서브프로젝트(저장소+사진+인바디). 식단·강사 정산은 별도 스펙으로 분리됨.
