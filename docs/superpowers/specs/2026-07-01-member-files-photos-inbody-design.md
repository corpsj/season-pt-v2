# 회원 첨부파일 기반 — 진행 사진 + 인바디 PDF (설계)

- 날짜: 2026-07-01
- 상태: 승인 대기(스펙 리뷰)
- 브랜치: `membership-lifecycle`

## 배경

대표와의 논의에서 나온 4개 기능(식단 관리 / 강사가 회원 사진을 기록용으로 저장 / 인바디 PDF / 강사 회당 정산)을 앱에 반영한다. 4개는 서로 독립적인 서브프로젝트라 각각 스펙→플랜→구현으로 나눈다. 본 스펙은 그중 **파일 저장소 기반 + 진행 사진 + 인바디 PDF**를 한 묶음으로 다룬다.

이유: 사진과 인바디 PDF는 "회원에 파일을 첨부하고 나중에 열람"이라는 동일 패턴이며, 앱에 **파일/이미지 업로드 인프라가 전혀 없다**(현재 파일 입력은 콘솔 CSV 파싱뿐, 아바타는 `avatar_tone` 색상 생성). 따라서 저장소 기반을 한 번 만들고 두 기능을 얇게 올린다.

- **식단(회원 기록 → 강사 피드백)**: 이후 별도 스펙. 본 스펙의 저장소를 재사용한다.
- **강사 회당 정산(세션 유형별 단가)**: 이후 별도 스펙. 저장소와 무관한 독립 기능.

## 목표 / 비목표

**목표**
- 강사(담당 강사 또는 대표)가 회원 상세에서 진행 사진을 촬영/업로드하고 인바디 결과 PDF를 업로드한다.
- 회원은 회원 앱에서 본인의 진행 사진과 인바디 PDF를 **열람**한다(둘 다 노출, 읽기 전용).
- 대표는 콘솔 회원 상세에서 같은 자료를 열람한다.
- 신체 사진은 민감정보이므로 저장소는 비공개, 모든 접근은 서버 액션이 통제한다.

**비목표**
- 인바디 PDF에서 수치 자동 추출(파싱) — 하지 않는다. PDF는 첨부/열람만.
- 회원의 사진 업로드 — v1에서는 강사만 업로드(회원은 열람만).
- 기존 `body_compositions`(체중/골격근/체지방) 입력 UI — 본 스펙 범위 아님(휴면 유지). 인바디는 "PDF만" 방식으로 확정됨.
- 사진 before/after 비교 뷰, 정렬/태깅 — v1 제외(단순 날짜순 목록).

## 접근 방식 (핵심 결정)

**채택: 비공개 버킷 + 서버 발급 서명 URL. 업로드·열람 모두 서버 액션이 호출자를 검증한다.**

- 업로드: 서버 액션이 `getTrainerContext()`로 강사 권한 + 담당 관계를 검증한 뒤 서비스 롤 `sb` 클라이언트로 Storage에 올리고 `member_files` 행을 삽입.
- 열람: 서버 getter가 호출자(강사 `getTrainerContext` / 회원 `getMemberContext`)를 검증하고, 각 행에 대해 짧은 수명(60분) 서명 URL(`createSignedUrl`)을 발급. 클라이언트는 서명 URL로 `<img>`/PDF 링크를 렌더.

대안(기각):
- **공개 버킷 + 추측 불가 경로**: 서명 불필요라 단순하지만 신체 사진이 공개 URL로 유출·색인될 위험 → 보안상 기각.
- **클라이언트 직접 업로드(RLS)**: Vercel 함수 용량 제한을 우회하나, 회원이 비-Auth라 RLS 권한 설계가 복잡 → v1 기각. 대용량 업로드가 문제되면 `createSignedUploadUrl`(서명 업로드 URL)로 승급.

## 데이터 모델

마이그레이션 `supabase/migrations/0012_member_files.sql`:

```sql
create type member_file_kind as enum ('photo', 'inbody');

create table if not exists member_files (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  kind member_file_kind not null,
  storage_path text not null,          -- 비공개 버킷 내 경로
  note text,                            -- 사진 메모(선택)
  taken_at date not null default current_date,
  created_by uuid references trainers(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_member_files_member on member_files(member_id, kind, taken_at desc);

-- 비공개 버킷 생성
insert into storage.buckets (id, name, public)
values ('member-files', 'member-files', false)
on conflict (id) do nothing;
```

- 사진/PDF를 `kind`로 구분하는 **단일 테이블**.
- 경로 규약: `{memberId}/{kind}/{fileId}.{ext}` (버킷 `member-files` 기준).
- `on delete cascade`로 회원 삭제 시 행은 정리되지만 Storage 객체는 자동 삭제되지 않는다 → 회원 삭제 액션과 파일 삭제 액션에서 Storage 객체를 함께 제거한다.

## 서버 액션 & 접근제어

새 파일 `src/lib/data/groups/member-files-actions.ts` (`"use server"`).

- `uploadMemberFile(formData: FormData)` → `{ ok, error? }`
  - 입력: `memberId`, `kind`, `file`, `note?`, `takenAt?`.
  - 권한: `getTrainerContext()` 필요. 대표이거나 해당 회원의 담당 강사(`member_trainers`)여야 함.
  - 검증: `kind==='photo'`면 MIME `image/*`, `kind==='inbody'`면 `application/pdf`. 용량 상한 — 사진(다운스케일 후) 및 PDF 모두 **10MB** 초과 거부.
  - 처리: `sb.storage.from('member-files').upload(path, file)` → `member_files` insert. `revalidatePath('/t/members/[id]', ...)` 등.
- `deleteMemberFile(fileId: string)` → `{ ok, error? }`
  - 권한: 강사(담당) 또는 대표.
  - 처리: 행 조회 → `sb.storage.from('member-files').remove([storage_path])` → 행 삭제. (Storage 실패해도 행은 지우되 경고 반환하여 고아 감지.)
- `getMemberFiles(memberId: string, kind?: member_file_kind)` → 강사/대표용. 권한 검증 후 행 + 서명 URL 배열 반환.
- `getMyFiles(kind?: member_file_kind)` → 회원용. `getMemberContext()`로 로그인 회원 본인 것만 반환 + 서명 URL.

서명 URL 발급 실패는 해당 항목만 `url: null`로 두고 목록은 정상 반환.

## 화면

- **강사 `/t/members/[id]`** (체성분 섹션 `page.tsx:113` 아래):
  - "진행 사진" — 썸네일 그리드, 촬영/업로드 버튼(`<input type="file" accept="image/*" capture="environment">` → 모바일 카메라 직행), 탭하면 원본 확대, 삭제.
  - "인바디" — 날짜(`taken_at`)순 PDF 목록, 업로드 버튼(`accept="application/pdf"`), 항목 탭 시 새 탭 열람, 삭제.
- **회원 `/m/my`**: 본인 진행 사진 갤러리 + 인바디 PDF 목록. 읽기 전용(업로드/삭제 없음).
- **대표 콘솔 `/console/members`** 상세 패널: 같은 `getMemberFiles` getter를 재사용해 사진·인바디를 함께 표시(열람). 저비용이라 포함한다.

## 이미지 처리·용량·에러

- 업로드 전 **클라이언트 캔버스 다운스케일**: 최대 변 ~1600px, JPEG 품질 ~0.8 (보통 200–400KB). 용량·저장비용 절감 + 서버 액션 본문 제한 회피.
- ⚠️ **Next.js Server Action 본문 크기 제한**: 이 저장소의 Next는 학습 데이터와 다를 수 있으므로(AGENTS.md), 구현 시 설치된 Next 문서(`node_modules/next/dist/docs/`)에서 `serverActions.bodySizeLimit` 기본값과 설정법을 확인한다. 필요 시 `next.config`에서 ~10MB로 상향. 사진은 다운스케일로 충분, 인바디 PDF는 10MB 상한 안내.
- 에러 처리: MIME/용량 사전 검증 → 토스트로 즉시 거부. Storage 업로드 실패 → 토스트. 서명 URL 실패 → 플레이스홀더.

## 테스트

- 클라이언트 다운스케일 치수 계산(가로/세로 비율 유지, 최대 변 클램프)에 `bun test` 1개.
- MIME/용량 검증 가드(허용/거부 케이스)에 `bun test` 1개.
- 권한/DB 경로는 통합 성격이라 단위 테스트 제외.

## 배포

1. 마이그레이션 적용 + 배포: `bash scripts/deploy-prod.sh supabase/migrations/0012_member_files.sql`
2. 배포 전 `git push origin membership-lifecycle` (푸시 후 배포 규칙).
3. 버킷은 마이그레이션의 `storage.buckets` insert로 생성되므로 별도 대시보드 작업 불필요.

## 미해결/기본값으로 확정한 항목

- 대표 콘솔 노출: **포함**(저비용 재사용).
- 인바디 PDF 용량 상한: **10MB**.
- 사진 업로더: 강사만(회원 열람 전용).
