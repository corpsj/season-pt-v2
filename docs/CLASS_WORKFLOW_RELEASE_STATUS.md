# 수업 기록 개선 — 운영 반영 결과

확인일: 2026-10-24 UTC. 작업 저장소: `season-pt_v2`, 시작 리비전 `ba1c905`.

**운영 DB 0026·0027 적용, 앱 배포, 기본 사후 검증을 완료했다.** 실행 앱 커밋은 `a2b7085e04af5b349c3117f1ba9242c81dd2b6f2`, 운영 배포는 `dpl_2QjPovmj1JPcEKcpLgDamYogUugA`다. Vercel READY·운영 별칭·실행 커밋을 직접 확인했다. 실제 회원 수업을 시험 완료/정정하거나 고객 알림·결제를 발생시키지 않았다. **실제 로그인 후 수업 전체 E2E와 DB 복원 리허설은 미실행**이며 아래에서 구분한다. 상세 복구 절차는 [실행 문서](CLASS_WORKFLOW_DEPLOY_RUNBOOK.md)를 따른다.

사용 경로: 기존 트레이너 로그인 → 일정의 수업 → 수업 기록(`/t/record/[sessionId]`). 콘솔 달력의 기록/출석도 이 화면으로 연결된다. 2:1은 회원을 선택해 기록하고, 초안을 공유하거나 서명 후 수업 완료를 처리한다. 운영에서 실제 회원 자료를 시험 변경하지 않았다.

## 확인된 운영 대상과 접근

| 대상 | 직접 확인한 결과 |
|---|---|
| 공개 URL | <https://season-pt.vercel.app> — 배포 후 HTTP·브라우저 확인 |
| Vercel 로컬 링크 | 프로젝트 `season-pt`, ID `prj_Cuqh3pY2JEjper5fRtrxANwwnVej`, 팀 `team_S8wxpUJYhgdrioR9C2FbZvLV` |
| Supabase | 설정 URL·DB 연결의 프로젝트 ref가 `exdsrqjvjmakduufslif`로 일치. PostgreSQL 17.6 읽기 전용 접속 성공 |
| 운영 스키마 | 0026→0027 단일 트랜잭션 적용 완료. 새 컬럼·트리거·RLS 2개 및 함수 7개(트리거 포함)의 서비스 전용 권한 확인. [메타데이터](qa/class-workflow/post-migration.json) |
| 배포 접근 — **해결** | 사용자 공식 Google 승인 후 프로필 계정 `corpsjld01-6765`와 프로젝트 조회 HTTP 200 직접 확인. 운영 팀 `seasonPT` (`season-pt`) |
| 현재 운영 배포 | `dpl_2QjPovmj1JPcEKcpLgDamYogUugA`, `READY`, `production`, 커밋 `a2b7085e04af5b349c3117f1ba9242c81dd2b6f2`. [실행 확인](qa/class-workflow/deployment-verified.json) |
| 변경 전 배포 | `dpl_2Sb8U5Gq5ZdNV45ftL6L1PkAY6h6`, 커밋 `4018f88`. 복구 조건·호환 대체 소스는 실행 문서에 기록 |
| Git 연동 | Vercel 프로젝트의 Git 연결 `null`. 반영 전 원격 `main`은 `ba1c905`로 당시 운영보다 기존 인증·예약 무결성 커밋 1개 앞섰다. 관련 개선본을 main에 푸시한 뒤 같은 커밋으로 직접 배포했다. 이후 결과 문서 커밋은 앱 소스와 구분 |
| 백업 — **완료** | 공식 Studio 소스에서 공개 운영 CA를 확보. 체인·호스트명 검증 및 `verify-full` 백업 성공. 104194 bytes·해시·전체 아카이브 읽기 확인. 실제 DB 복원은 미실행 |

이전 `.env.deploy.local` 연결의 계정은 `weetmade-2064`이고, `weet's projects` 팀만 접근 가능해 운영 조회가 403이었다. 기존 토큰을 변경·삭제하거나 프로젝트를 재링크하지 않았다. 사용자가 운영 Google 계정을 확인한 뒤 공식 기기 인증으로 접근을 복구했다.

첫 승인 성공 때는 프로세스에 기존 `VERCEL_TOKEN`이 상속되어 CLI가 `skipWrite`를 유지하므로 새 승인 결과가 저장되지 않는 원인을 확인했다. 이 계정의 재승인을 위해 명령 범위에서만 `env -u VERCEL_TOKEN`을 사용했으며, 이후 인증 파일 저장·사용자 프로필·운영 팀/프로젝트 접근을 실제 확인했다. 현재 승인 결과는 권한 700 디렉터리 `/tmp/season-pt-release/vercel-auth-corpsj`의 권한 600 파일로 보관한다. 자격증명 값·일회성 승인 링크는 저장소에 기록하지 않는다. **재개 시 기존 승인 결과를 재사용하고 새 로그인을 중복 시작하지 않는다.**

기존 배포 스크립트는 `.env.deploy.local`의 이전 토큰을 명시 사용하므로 그대로 실행하면 잘못된 연결로 돌아간다. 재개할 때 공식 CLI의 같은 직접 업로드 절차를 사용하되 기존 환경 토큰은 명령 범위에서 제외하고 승인된 임시 `--global-config`를 사용한다. 환경 파일·기존 계정 토큰은 덮어쓰지 않는다.

적용 전 운영 DB 확인: 0026 RPC 2개와 0027 객체가 없었다. 기존 서명·회원권 연결 컬럼은 존재한다. `schema_migrations`에는 0001~0014만 기록되어 있어 기록만 보고 후속 SQL 전체를 중복 적용하면 안 된다. 0026이 정리할 중복 pending은 **0그룹/0추가 요청**으로 집계했다. 고객 행 내용은 분석용으로 조회/출력하지 않았다. 기존 migration history는 수동 적용 이력이 불완전하므로 이번 파일 적용 성공·해시·카탈로그 객체·권한을 기준으로 검증했고, 과거 이력 행을 임의 보정하지 않았다.

최초 백업은 CA가 없어 실패했으며 0바이트 파일은 백업으로 취급하지 않는다. 이후 공식 Studio SSL 컴포넌트와 URL 설정에서 운영 CA 공개 원본을 찾아 직접 내려받았다. 시스템 신뢰 저장소·검증 모드를 바꾸지 않고 운영 호스트의 체인/호스트명을 확인했다. 최종 백업은 `/Users/zoopark-studio/Documents/dev/season-pt_v2-backups/20261024T023849Z`에 있다. 데이터 내용은 출력/보고/저장소에 복사하지 않았다. 같은 위치에 기존 기준 코드로 만든 쓰기 중단 호환 복구 소스도 보관했다. 자세한 파일·해시·복구 조건은 [배포 실행 문서](CLASS_WORKFLOW_DEPLOY_RUNBOOK.md)에 기록했다.

## 수정 및 독립 검증

기능 범위와 파일 목록은 [구현 계획](CLASS_WORKFLOW_IMPLEMENTATION_PLAN.md)의 ‘구현 결과’를 참조한다. 회원별 지난 운동·목표/실제 세트·복사·서명 완료·정정 이력, 직렬 자동 저장·실패 재시도·같은 탭 복구를 구현했다.

실제 다중 연결 검증을 위해 프로젝트 의존성을 바꾸지 않고 `/tmp`에 네이티브 PostgreSQL 18.4와 `pg` 시험 도구를 준비했다. DB는 localhost의 `spt_qa_` 접두사 합성 전용 DB이며 실제 회원·Supabase 인증 계정·외부 발송을 사용하지 않는다. 운영 PostgreSQL 17.6과 버전은 다르다.

이 검증에서 새 완료 처리의 회원 `FOR UPDATE` 잠금과 기존 취소 처리의 회원권→회원 FK 검사 사이 교착을 재현했다. 회원 잠금을 `FOR NO KEY UPDATE`로 변경해 차감 직렬화는 유지하고 FK 검사를 허용했다. 또한 기존 취소/이동 RPC도 세션→요청 순서로 잠그도록 0027에서 호환 재정의했다. 기존 0026 파일의 과거 pending 정리 쿼리를 반복하지 않는다.

운영 기본 권한을 읽기 전용으로 확인해 새 함수에 anon/authenticated EXECUTE가 명시 부여됨을 발견했다. 0027은 PUBLIC뿐 아니라 두 역할에서도 일곱 함수 권한을 명시 회수한다. 같은 기본 권한을 메모리 PGlite fixture에 재현해 회귀를 확인했고, 최종 16개 시험이 통과했다. 인증/익명 직접 RPC 실행 거부는 함수 계층의 오류까지 검사한다. 기존 native PostgreSQL 20개 결과는 이 ACL 보완 전 코어 동시성 검증이며, ACL은 이번 메모리 시험 및 적용 후 운영 메타데이터로 별도 검증한다. 합성 DB 복원 리허설을 수행하거나 재시도한 것이 아니다.

수정 전 로그의 RPC 직접 실행 거부 시험 1건은 새 로컬 public 스키마의 USAGE 권한이 없는 fixture 문제였다. Supabase 역할과 동일하게 스키마 USAGE를 부여한 합성 fixture에서 함수 EXECUTE 거부를 다시 확인했다. 교착 재현 실패와 구분하며, 운영 권한 설정은 변경하지 않았다.

| 상태 | 검증 | 결과 / 증거 |
|---|---|---|
| 통과 | 타입 / ESLint | `bunx tsc --noEmit`, `bun run lint` 오류 없음 |
| 통과 | Bun 회귀 | **81 pass, 0 fail**, 18개 파일. [로그](qa/class-workflow/bun-test.log) |
| 통과 | 격리 PostgreSQL 독립 연결 | **20 pass, 0 fail**. 마지막 1회 경쟁, 동일 작업 ID 재시도 대기, 별도 수업 취소·완료 경합, 같은 수업 취소/이동·완료 잠금 순서 포함. [최종 로그](qa/class-workflow/postgres-test.log), [수정 전 재현](qa/class-workflow/postgres-before.log) |
| 통과 | PGlite SQL | 16 pass, 0 fail, 독립 연결 전용 5개 skip. 기본 단일 연결 모드와 실제 동시성 검증을 구분. [로그](qa/class-workflow/db-test.log) |
| 통과 | 격리 및 실제 production 빌드 | 격리 Next 16.2.9 webpack 빌드와 실제 Vercel의 기본 Turbopack 빌드·TypeScript 완료. [격리 로그](qa/class-workflow/build.log), [운영 빌드 요약](qa/class-workflow/production-build-summary.log) |
| 통과 | 합성 UI | 실제 변경 컴포넌트, 390/360px, 회원 전환 직전 입력·저장 실패/같은 탭 복구·미저장 이탈 경고·서명 완료/정정. 서버는 합성 fixture이며 실제 인증 E2E가 아님. [로그](qa/class-workflow/ui-test.log) |
| 통과 | 배포 후 실제 HTTP·브라우저 | 로그인 200, 콘솔 로그인 폼, t/m/수업기록 비로그인 차단, 개발 fixture 404. 7개 흐름·pageErrors=0·blocked=0. [HTTP](qa/class-workflow/production-http.log), [브라우저](qa/class-workflow/production-ui.log) |
| 통과 | 실제 backend RPC·권한 | 서비스 역할의 읽기 전용 helper 200/false, anon 401/42501. authenticated/anon의 7개 함수 EXECUTE=false 및 service=true를 DB에서 확인. [RPC](qa/class-workflow/live-rpc-after-deploy.log) |
| 미실행 | 실제 로그인 / 역할별 인증 E2E | 승인된 별도 테스트 Supabase/계정 연결이 확인되지 않아 실제 고객 계정으로 시험하지 않음. SQL actor/DB role 거부 시험은 통과 |
| 통과 | 운영 public 백업 | 공식 CA의 `verify-full` 연결. schema/data 백업·전체 파일 읽기·해시 확인. Auth/Storage/전역 역할은 범위 밖 |
| 통과 | 호환 복구 소스 | 빌드 및 인증/쓰기 중단 가드 6개 통과. 원장 보존 이후 단순 과거 앱 롤백의 위험을 피하는 복구 소스 준비. 운영 복구 배포 자체는 미실행 |
| 승인 대기 | 합성 DB 복원 리허설 | 별도 자동 승인 검토 거부 후 재시도하지 않음. 운영 백업 파일 읽기 검증과 구분 |
| 통과 | 운영 마이그레이션·푸시·배포 | fresh 백업 해시 확인→0026/0027 원자 적용·권한 assertion→main 푸시→기존 프로젝트 직접 업로드→READY/별칭/커밋 확인. [적용 로그](qa/class-workflow/migration-apply.log) |

백업 도구 준비: 공식 Homebrew bottle의 `pg_dump`/`pg_restore` 18.6을 `/tmp/season-pt-release/pg-client`에만 추출해 버전 실행을 확인했다. 시스템 설치·프로젝트 의존성 변경은 없다. 이후 localhost `spt_qa_*` 합성 DB의 백업/별도 DB 복원 시험은 자동 승인 검토가 ‘DB 변경은 조사 범위를 넘는다’는 사유로 거부했다. 명령과 임시 시험 스크립트 생성 모두 실행되지 않았음을 확인했으며 재시도·간접 실행하지 않았다. 이 시험을 계속하려면 해당 범위 제한을 해소할 추가 승인이 필요하다. 운영 백업·복원 검증과 구분한다.

브라우저 첫 검사에서는 회원 생년월일 입력을 일반 password로 가정한 선택자 오류가 있었다. 소스의 숫자 마스킹 입력에 맞춰 수정했다. 다음 검사에서 기존 폰트 CDN을 테스트 정책이 차단해 Event 오류가 발생했고, 앱이 실제 사용하는 고정 버전 CDN/리디렉션 경로를 허용한 뒤 7개 흐름·브라우저 오류/차단 리소스 0건으로 통과했다. 앱 코드는 이 검사 때문에 변경하지 않았다. [모바일 로그인](qa/class-workflow/production-login-mobile.png), [콘솔 로그인](qa/class-workflow/production-console-desktop.png)은 입력하지 않은 공개 화면이다.

미실행은 실제 회원 로그인/권한별 앱 E2E, 운영 실제 완료·정정/차감 시험, DB 복원 리허설·운영 부하다. 새 테스트 자격증명을 발급하거나 실제 회원 기록을 시험 변경하지 않았다. 복원 리허설의 자동 승인 검토 거부는 유지했으며 재시도하지 않았다. 롤백이 필요한 장애는 발생하지 않아 운영 롤백 자체도 실행하지 않았다.

## 운영 반영 순서

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

복구는 마지막 서버 초안 및 지원 브라우저의 같은 탭 `sessionStorage` 입력까지다. **탭 종료·OS 강제 종료 후 미전송 입력 복구는 보장하지 않는다.** 완전한 오프라인 동기화나 탭/기기 간 자동 병합은 구현하지 않았다. 예약 회차 hold·결제 전체 원자화는 후속 범위다. 운영 배포·백업·호환 복구 준비는 완료했지만 복원 리허설과 실제 로그인 수업 E2E를 통과했다고 표시하면 안 된다.
