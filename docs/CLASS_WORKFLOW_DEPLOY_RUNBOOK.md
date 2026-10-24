# 수업 기록 개선 배포·복구 절차

대상은 Vercel 팀 `seasonPT` (`season-pt`), 프로젝트 `prj_Cuqh3pY2JEjper5fRtrxANwwnVej`, Supabase `exdsrqjvjmakduufslif`다. 운영 URL은 <https://season-pt.vercel.app>. 운영 반영 전/후 결과는 [상태 보고](CLASS_WORKFLOW_RELEASE_STATUS.md)에 구분한다.

## 확보한 체크포인트

- 변경 전 앱: `dpl_2Sb8U5Gq5ZdNV45ftL6L1PkAY6h6`, 소스 `cli`, 커밋 `4018f883c15afa9848cf03fc727fcc8da10fa060`, READY. Git 자동 배포 연결은 없다.
- 원격 main `ba1c905`는 운영보다 기존 인증·예약 무결성 커밋 1개 앞선다. 이번 클래스 구현의 기준도 이 커밋이며, 기존 변경을 되돌리지 않는다.
- public 스키마·데이터 백업: `/Users/zoopark-studio/Documents/dev/season-pt_v2-backups/20261024T022047Z/public-before.dump`, 104194 bytes, SHA-256 `27ee95289a557bec040ad751a7ed9c4940de6c5aad6ec45f3ee4e81e2b68d1ee`. 디렉터리 700, 파일 600. 동일 위치의 schema SQL·manifest도 보관했다. Auth/Storage/전역 역할은 변경 대상이 아니므로 이 백업 범위에 포함하지 않았다.
- `pg_restore --file=/dev/null`로 전체 아카이브를 읽고 압축 해제하는 검증을 통과했다. **실제 DB에 넣는 복원 시험은 아니다.** 합성 DB 복원 리허설은 별도 승인 대기이며 수행하지 않았다.
- 공식 Supabase Studio의 [SSL 컴포넌트](https://github.com/supabase/supabase/blob/master/apps/studio/components/interfaces/Settings/Database/SSLConfiguration.tsx)와 [URL 설정](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json)에서 운영 CA 원본을 확인했다: <https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt>. 공통 `Supabase Root 2021 CA`, SHA-256 `807025AD50D4ED219D2C9C7D299C004F824EB00CF7F65AFEF607D07B72E6CAFA`, 유효기간 2031-04-26. 운영 pooler의 체인과 호스트명 검증을 통과한 뒤 백업 명령에만 지정했다. 시스템 신뢰 저장소·SSL 설정은 변경하지 않았다.

## 정상 반영

1. 작업 트리·원격 리비전·프로젝트/DB 대상을 다시 확인한다. 승인된 임시 Vercel 인증은 `/tmp/season-pt-release/vercel-auth-corpsj`다. 상속된 이전 `VERCEL_TOKEN`을 CLI 명령에서만 제외한다. 기존 환경 파일은 덮어쓰지 않는다.
2. 운영 DB에는 0026 RPC와 0027 객체가 없음을 확인했다. 0026의 정리 대상인 중복 pending은 0건이었다. 마이그레이션 기록에는 0001~0014만 있지만 후속 컬럼이 존재하므로 전체 후속 파일을 재적용하지 않는다.
3. 백업을 변경 직전에 확보하고 파일 읽기·해시 검증을 확인한다. `verify-full`과 위 CA를 유지한다.
4. 0026→0027을 한 트랜잭션으로 적용하고 실패하면 전체 롤백한다. `lock_timeout`을 짧게 두어 운영 요청을 장시간 막지 않는다. 실제 회원 수업을 시험 완료/정정하지 않는다. 운영 기본 ACL의 anon/authenticated EXECUTE까지 명시 회수한 최종 0027을 사용한다.
5. 스키마 객체·RPC 서명·트리거·RLS·service_role 권한·authenticated EXECUTE 거부를 메타데이터로 확인한다. 수업권을 시험 차감하지 않는다. 새 테이블은 애플리케이션의 정상 사용 전 비어 있어야 한다.
6. 관련 변경만 원격 main에 푸시하고 HEAD 일치를 확인한다. 기존 직접 업로드 절차와 같은 Vercel CLI를 사용하되 승인된 연결로 수행한다:

```sh
env -u VERCEL_TOKEN NO_UPDATE_NOTIFIER=1 VERCEL_TELEMETRY_DISABLED=1 \
  VERCEL_TOKEN_STORAGE=file vercel deploy --prod --yes \
  --global-config /tmp/season-pt-release/vercel-auth-corpsj --scope season-pt
```

7. 완료 응답만으로 판정하지 않는다. READY·프로젝트·실행 커밋·운영 도메인 별칭, 로그인 화면, 비로그인 보호 경로, 개발 fixture 404와 새 RPC 메타데이터를 확인한다. 실제 로그인/회원 수업 E2E 미검증은 분리해 보고한다.

## 복구

마이그레이션 실패 시에는 트랜잭션 롤백을 확인하고 앱을 배포하지 않는다. 추가 테이블/컬럼을 지우는 역마이그레이션이나 운영 데이터 복원은 자동 수행하지 않는다.

앱 문제로 새 작업이 **아직 한 번도 실행되지 않았다면**, 기존 배포가 여전히 READY인지 확인한 뒤 명시한 이전 배포로 되돌릴 수 있다. 아래 명령은 필요 시에만 실행한다:

```sh
env -u VERCEL_TOKEN NO_UPDATE_NOTIFIER=1 VERCEL_TELEMETRY_DISABLED=1 \
  VERCEL_TOKEN_STORAGE=file vercel rollback dpl_2Sb8U5Gq5ZdNV45ftL6L1PkAY6h6 \
  --yes --global-config /tmp/season-pt-release/vercel-auth-corpsj --scope season-pt
```

**새 정정/작업 이력이 생겼으면 과거 앱으로 단순 롤백하지 않는다.** 과거 서버는 정정 원장을 삭제하는 방식이라 보존된 역전 이력을 잘못 복원할 수 있다. 이 경우 준비한 호환 복구 소스를 새 앱 배포로 올려 해당 쓰기를 일시 중단한다:

- 소스 아카이브: 위 백업 폴더의 `app-readonly-fallback.tar.gz`.
- 기준: `ba1c905`에 [검토 가능한 패치](qa/class-workflow/rollback-readonly.patch)만 적용. 기존 인증 검사를 유지하고 출석·정정·기록 저장/삭제·예약 요청 확정을 오류 안내로 중단한다. 다른 화면 읽기와 데이터는 유지한다.
- 아카이브 SHA-256 `3006434574385fdb634e707cc9d94a726c8a6d7d3ee60e6375b0e22a70727713`. [Manifest](qa/class-workflow/rollback-manifest.json).
- 검증: 실제 환경 파일 없는 production 빌드 통과, DB/알림/재검증 접근이 발생하면 즉시 실패하는 가드 시험 **6 pass**. [빌드](qa/class-workflow/rollback-build.log), [가드 시험](qa/class-workflow/rollback-test.log).
- 새 임시 폴더에 아카이브를 풀고 해시·패치·대상 `.vercel/project.json`을 확인한 뒤 같은 승인 연결로 직접 업로드한다. 아카이브에는 `.env*`·node_modules·빌드 산출물이 없다. 실제 운영 환경 값은 기존 Vercel 프로젝트에서 공급하며 더미 검증 빌드를 `--prebuilt`로 배포하지 않는다.
- 복구 후 실행 배포·별칭·로그인 화면을 다시 확인하고, 관련 쓰기가 중단되고 데이터가 유지되는지 확인한다. 수정본 검증 후 정상 기능을 재개한다.

복구 소스는 실제 운영에 배포하지 않았고, DB 복원 리허설도 수행하지 않았다. 백업의 완전한 복원 동작·실제 인증 수업 흐름·부하는 남은 검증 범위다.
