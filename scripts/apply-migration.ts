// 마이그레이션을 Supabase Postgres에 직접 적용(psql 미설치 → Bun.SQL).
// 실행:  set -a; . ./.env.deploy.local; set +a; bun run scripts/apply-migration.ts supabase/migrations/0005_membership_lifecycle.sql
import { SQL } from "bun";
const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: bun run scripts/apply-migration.ts <file.sql> [...]");
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("missing SUPABASE_DB_URL — `set -a; . ./.env.deploy.local; set +a` 먼저");
const sql = new SQL(url);
// 파일 단위 트랜잭션 — 중간 실패 시 반쪽 스키마로 남지 않게 전체 롤백(감사 #44)
for (const f of files) {
  console.log(`→ applying ${f}`);
  const text = await Bun.file(f).text();
  await sql.begin(async (tx) => { await tx.unsafe(text); });
}
await sql.end();
console.log("done");
