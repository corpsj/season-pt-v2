#!/usr/bin/env bash
# season-pt_v2 운영 배포 헬퍼 (직접 업로드 방식).
#
# 시크릿은 .env.deploy.local(gitignore)에서 로드: VERCEL_TOKEN · VERCEL_SCOPE · SUPABASE_DB_URL
# 같은 Supabase(서울 exdsrqjvjmakduufslif) 사용. 함수 리전은 vercel.json의 regions:["icn1"] 로 서울 고정.
#
# 사용법:
#   bash scripts/deploy-prod.sh
#       → 코드만 운영 배포
#   bash scripts/deploy-prod.sh supabase/migrations/00XX_foo.sql [...]
#       → 지정 마이그레이션을 운영 DB에 순서대로 적용 후 배포 (스키마 의존 시 마이그 먼저)
#
# 사전 1회 설정: gh repo + vercel link + vercel env (scripts/setup-deploy.sh 참고).
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.deploy.local ]; then
  echo "ERROR: .env.deploy.local 이 없습니다 (VERCEL_TOKEN/VERCEL_SCOPE/SUPABASE_DB_URL)." >&2
  exit 1
fi
set -a; . ./.env.deploy.local; set +a

# 1) (선택) 마이그레이션을 운영 DB에 적용 — 로컬 supabase_db 컨테이너의 psql 사용
if [ "$#" -gt 0 ]; then
  CID="$(docker ps --format '{{.Names}}' | grep -i supabase_db | head -1 || true)"
  if [ -z "$CID" ]; then
    echo "ERROR: supabase_db 컨테이너가 없습니다. supabase start 후 재시도하거나 SQL Editor로 적용." >&2
    exit 1
  fi
  for f in "$@"; do
    echo "→ PROD DB 적용: $f"
    docker exec -i "$CID" psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 < "$f"
  done
fi

# 2) Vercel 운영 배포 (직접 업로드)
echo "→ Vercel 운영 배포 (icn1)"
vercel deploy --prod --yes --token "$VERCEL_TOKEN" ${VERCEL_SCOPE:+--scope "$VERCEL_SCOPE"}
