#!/usr/bin/env bash
# season-pt_v2 — 1회성 배포 셋업: 새 GitHub repo + Vercel 프로젝트 링크 + 운영 env 주입.
# 이후 배포는 scripts/deploy-prod.sh 사용. 시크릿은 .env.deploy.local + .env.local 에서 로드.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env.deploy.local; . ./.env.local; set +a

REPO="${REPO:-season-pt-v2}"
PROJECT="${PROJECT:-season-pt-v2}"

# 1) GitHub repo 생성 + push (gh 인증 필요)
if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$REPO" --private --source=. --remote=origin --push
else
  git push -u origin HEAD
fi

# 2) Vercel 프로젝트 링크 (없으면 생성)
vercel link --yes --project "$PROJECT" --token "$VERCEL_TOKEN" ${VERCEL_SCOPE:+--scope "$VERCEL_SCOPE"}

# 3) 운영 env 주입 (production)
setenv() {
  local name="$1" val="$2"
  [ -z "$val" ] && return 0
  printf '%s' "$val" | vercel env add "$name" production --force --token "$VERCEL_TOKEN" ${VERCEL_SCOPE:+--scope "$VERCEL_SCOPE"} >/dev/null 2>&1 || true
}
setenv NEXT_PUBLIC_SUPABASE_URL "$NEXT_PUBLIC_SUPABASE_URL"
setenv NEXT_PUBLIC_SUPABASE_ANON_KEY "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
setenv SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
setenv MEMBER_SESSION_SECRET "$MEMBER_SESSION_SECRET"
setenv TRAINER_EMAIL_DOMAIN "$TRAINER_EMAIL_DOMAIN"
setenv CRON_SECRET "${CRON_SECRET:-}"
echo "setup complete — now: bash scripts/deploy-prod.sh"
