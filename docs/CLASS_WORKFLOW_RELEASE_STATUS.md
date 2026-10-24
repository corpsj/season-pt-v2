# 수업 기록 개선 — 운영 반영 준비 및 차단 상태

확인일: 2026-10-24 UTC. 작업 저장소: `season-pt_v2`, 시작 리비전 `ba1c905`.

**개선 코드와 로컬 검증은 완료했지만 운영 배포는 차단되어 있다. 운영 DB 변경·원격 푸시·배포 제출은 실행하지 않았다.** 10월 24일 사용자의 ‘pt앱 개선하고 운영배포 반영해’ 요청으로 이전의 운영 적용 금지 범위는 해제되었다. 아래 접근 문제와 복구 준비가 해결되어야 배포를 재개한다.

## 확인된 운영 대상과 접근

| 대상 | 직접 확인한 결과 |
|---|---|
| 공개 URL | <https://season-pt.vercel.app> — 배포 전 기존 서비스 HTTP 응답 확인 |
| Vercel 로컬 링크 | 프로젝트 `season-pt`, ID `prj_Cuqh3pY2JEjper5fRtrxANwwnVej`, 팀 `team_S8wxpUJYhgdrioR9C2FbZvLV` |
| Supabase | 설정 URL·DB 연결의 프로젝트 ref가 `exdsrqjvjmakduufslif`로 일치. PostgreSQL 17.6 읽기 전용 접속 성공 |
| 운영 스키마 | `move_session_with_tombstone_atomic` 미존재, `class_operations`·`class_workout_drafts`·`sessions.attendance_version` 미존재. 적어도 0026 의존성과 0027 개선 마이그레이션이 필요함 |
| 배포 접근 — **거부** | 구성된 토큰은 사용자 조회 HTTP 200이나 연결된 운영 프로젝트 조회는 **HTTP 403, `forbidden / Not authorized`**. 토큰으로 조회되는 팀 목록에 운영 팀이 없음. 접근 가능한 다른 팀에는 `season-pt` 프로젝트가 없음 |
| 진행 중 작업 | 오래 기다리던 CLI `whoami`는 이 작업의 프로세스만 종료했다. 배포·DB 쓰기의 불확실한 실행 결과는 없음 |

프로젝트 조회 거부는 토큰 유효성이라는 새 근거를 확인한 뒤 한 번 재확인했고 동일하게 거부되었다. 다른 팀으로 재링크하거나 새 토큰을 발급하거나 권한/보안 설정을 변경하지 않았다. **필요한 사용자 조치: 기존 Vercel 운영 팀의 `season-pt` 프로젝트에 접근 가능한 연결을 복구/연결해야 한다. 비밀 토큰을 채팅에 붙여넣을 필요는 없다.**

현재 구성된 연결의 확인 가능한 계정 handle은 `weetmade-2064`, 접근 가능한 팀은 `weet's projects` (`weets-projects-6c7745e8`)이다. 운영 팀의 표시 이름·slug·접근 가능한 계정명은 미확인이다. [Vercel 공식 대시보드](https://vercel.com/dashboard)에서 기존 `season-pt` 프로젝트가 보이는 계정/팀을 확인하는 것이 최소 조치다. 공식 로그인만으로 현재 로컬 토큰 권한까지 해결되는지는 확인하지 못했다. 저장소의 공식 절차는 `scripts/deploy-prod.sh` 직접 업로드이며 `.github` workflow는 없다. GitHub 원격은 `corpsj/season-pt-v2`이나 Vercel Git 연동 자동 배포 여부는 조회가 거부되어 미확인이다.

사용자의 추가 ‘vercel 인증 다시 해봐’ 요청 후 기존 연결을 한 번 재확인해 동일 계정/403을 확인했다. 공식 CLI device 로그인 흐름을 권한 700의 `/tmp/season-pt-release/vercel-auth`로 시작해 사용자 승인 대기 중이다. 기존 자격증명 영구 저장 위치·환경 파일·프로젝트 권한은 변경하지 않았다. 일회성 승인 링크는 사용자에게 전달했고 저장소에는 보관하지 않는다. 승인 여부와 운영 팀 접근 성공은 아직 미확인이다.

## 수정 및 독립 검증

기능 범위와 파일 목록은 [구현 계획](CLASS_WORKFLOW_IMPLEMENTATION_PLAN.md)의 ‘구현 결과’를 참조한다. 회원별 지난 운동·목표/실제 세트·복사·서명 완료·정정 이력, 직렬 자동 저장·실패 재시도·같은 탭 복구를 구현했다.

실제 다중 연결 검증을 위해 프로젝트 의존성을 바꾸지 않고 `/tmp`에 네이티브 PostgreSQL 18.4와 `pg` 시험 도구를 준비했다. DB는 localhost의 `spt_qa_` 접두사 합성 전용 DB이며 실제 회원·Supabase 인증 계정·외부 발송을 사용하지 않는다. 운영 PostgreSQL 17.6과 버전은 다르다.

이 검증에서 새 완료 처리의 회원 `FOR UPDATE` 잠금과 기존 취소 처리의 회원권→회원 FK 검사 사이 교착을 재현했다. 회원 잠금을 `FOR NO KEY UPDATE`로 변경해 차감 직렬화는 유지하고 FK 검사를 허용했다. 또한 기존 취소/이동 RPC도 세션→요청 순서로 잠그도록 0027에서 호환 재정의했다. 기존 0026 파일의 과거 pending 정리 쿼리를 반복하지 않는다.

수정 전 로그의 RPC 직접 실행 거부 시험 1건은 새 로컬 public 스키마의 USAGE 권한이 없는 fixture 문제였다. Supabase 역할과 동일하게 스키마 USAGE를 부여한 합성 fixture에서 함수 EXECUTE 거부를 다시 확인했다. 교착 재현 실패와 구분하며, 운영 권한 설정은 변경하지 않았다.

| 상태 | 검증 | 결과 / 증거 |
|---|---|---|
| 통과 | 타입 / ESLint | `bunx tsc --noEmit`, `bun run lint` 오류 없음 |
| 통과 | Bun 회귀 | **81 pass, 0 fail**, 18개 파일. [로그](qa/class-workflow/bun-test.log) |
| 통과 | 격리 PostgreSQL 독립 연결 | **20 pass, 0 fail**. 마지막 1회 경쟁, 동일 작업 ID 재시도 대기, 별도 수업 취소·완료 경합, 같은 수업 취소/이동·완료 잠금 순서 포함. [최종 로그](qa/class-workflow/postgres-test.log), [수정 전 재현](qa/class-workflow/postgres-before.log) |
| 통과 | PGlite SQL | 15 pass, 0 fail, 독립 연결 전용 5개 skip. 기본 단일 연결 모드와 실제 동시성 검증을 구분. [로그](qa/class-workflow/db-test.log) |
| 통과 | 격리 production 빌드 | 실제 `.env*` 없이 동일 소스·더미 localhost 설정의 Next 16.2.9 `build --webpack`. [로그](qa/class-workflow/build.log) |
| 통과 | 합성 UI | 실제 변경 컴포넌트, 390/360px, 회원 전환 직전 입력·저장 실패/같은 탭 복구·미저장 이탈 경고·서명 완료/정정. 서버는 합성 fixture이며 실제 인증 E2E가 아님. [로그](qa/class-workflow/ui-test.log) |
| 통과 | 배포 전 기존 운영 공개 HTTP | 강사/회원 로그인 200, 비로그인 수업 기록 307→강사 로그인, 콘솔 200 로그인 폼, 개발 fixture 404. 개선본 반영 확인으로 취급하지 않음 |
| 미실행 | 실제 로그인 / 역할별 인증 E2E | 승인된 별도 테스트 Supabase/계정 연결이 확인되지 않아 실제 고객 계정으로 시험하지 않음. SQL actor/DB role 거부 시험은 통과 |
| 미실행 | 운영 데이터/스키마 백업·복원 리허설 | 배포 접근 및 이전 배포 식별자를 확보하지 못해 운영 변경 단계에 진입하지 않음. **백업 완료라고 주장하지 않음** |
| 미실행 | 운영 마이그레이션·푸시·배포·배포 후 검증 | 접근 문제 해결 전 중단. 현재 운영 배포의 커밋/ID도 미확인 |

## 접근 복구 후 재개 순서

1. 구성된 연결로 위 프로젝트·운영 도메인·현재 배포 ID/커밋·환경 연결을 다시 확인한다. `origin/main`과 작업 트리도 비교해 새 사용자 변경을 보존한다. Git 푸시의 자동 배포 연결 여부부터 확인한다.
2. 운영 스키마 적용 현황을 다시 조사한다. 0026의 중복 pending 정리는 기존 행을 변경하므로 먼저 중복 수와 적용 범위를 집계하고 변경 대상도 포함해 복구 가능한 백업을 확보한다. 실제 회원 데이터를 로그·보고서·저장소에 남기지 않는다. 격리 환경 복원 확인과 백업 접근 제한을 확보한다. 현재는 이 단계가 완료되지 않았다.
3. 실제 인증 경로는 승인된 테스트 환경·비민감 테스트 계정으로 검증한다. 다중 연결 SQL 시험은 아래 방법으로 재실행한다.
4. 이전 앱 배포 ID와 호환 롤백 방법을 확보한다. **새 정정 이력이 생긴 뒤 과거 ‘원장 삭제 후 회차 복원’ 서버로 그대로 되돌리면 안 된다.** 추가 스키마는 유지하고, 문제가 생기면 우선 해당 쓰기를 제한한 호환 앱으로 복구하는 절차가 필요하다. 운영 배포를 시작하기 전 구체적인 복구 대상과 절차를 검증한다.
5. 관련 변경만 커밋한다. 스키마가 앱보다 먼저 준비되도록 0026→0027 순으로 파일당 트랜잭션 적용한다. 기존 `scripts/apply-migration.ts`의 Bun SQL 경로를 사용할 수 있다. 기존 배포 헬퍼의 Docker 경로는 이전 거부 때문에 재시도하지 않는다. 0026/0027 재정의 후 기존 앱의 취소/이동도 호환 확인한다.
6. 연결된 기존 공식 배포 경로로 깨끗한 `main`·`origin/main` 일치 상태에서 반영한다. 우회용 dirty 배포 옵션은 사용하지 않는다.
7. 배포 완료/도메인 별칭/실행 커밋, 로그인·권한, 화면/API, 마이그레이션 버전을 확인한다. 고객 회차·기록을 시험 변경하지 않는다. 실패 시 사전에 확인한 복구 절차로 되돌리고 결과를 확인한다.

## 재현 및 보장 범위

기본 SQL 시험은 구현 계획의 PGlite 실행 예를 사용한다. 실제 독립 연결 시험은 **비어 있는 localhost 테스트 전용 DB**에만 허용한다. URL은 환경 변수로 주입하고 출력하거나 저장소에 저장하지 않는다.

```sh
# 호스트 localhost/127.0.0.1 + DB명 spt_qa_* + 명시적 reset 승인 모두 필요.
# 테스트는 이 격리 DB의 public/auth 스키마를 초기화한다.
CLASS_WORKFLOW_TEST_DB_URL='<local synthetic DB URL>' \
CLASS_WORKFLOW_QA_ALLOW_RESET=1 \
CLASS_WORKFLOW_PG_MODULE='<absolute path to installed pg/lib/index.js>' \
node --test scripts/qa/class-workflow-db.mjs
```

복구는 마지막 서버 초안 및 지원 브라우저의 같은 탭 `sessionStorage` 입력까지다. **탭 종료·OS 강제 종료 후 미전송 입력 복구는 보장하지 않는다.** 완전한 오프라인 동기화나 탭/기기 간 자동 병합은 구현하지 않았다. 예약 회차 hold·결제 전체 원자화는 후속 범위다. 운영 배포와 백업/롤백 준비가 미완료이므로 이번 상태를 운영 반영 완료로 표시하면 안 된다.
