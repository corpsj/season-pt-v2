// 마이그레이션을 Supabase Postgres에 직접 적용(psql 미설치 → Bun.SQL).
// 실행:  set -a; . ./.env.deploy.local; set +a; bun run scripts/apply-migration.ts supabase/migrations/0005_membership_lifecycle.sql
import { SQL } from "bun";
const files = process.argv.slice(2);
if (!files.length) throw new Error("usage: bun run scripts/apply-migration.ts <file.sql> [...]");
const url = process.env.SUPABASE_DB_URL;
if (!url) throw new Error("missing SUPABASE_DB_URL — `set -a; . ./.env.deploy.local; set +a` 먼저");
const sql = new SQL(url);
for (const f of files) { console.log(`→ applying ${f}`); await sql.unsafe(await Bun.file(f).text()); }
await sql.end();
console.log("done");
