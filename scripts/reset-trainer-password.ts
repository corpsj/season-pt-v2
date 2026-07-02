/**
 * 대표/강사 비밀번호 최후 복구 (앱 외부, service-role 필요).
 * 사용: bun scripts/reset-trainer-password.ts <username> <new-password>
 * 강사 인증 이메일이 가짜 도메인(@trainer.seasonpt.local)이라 이메일 리셋이 불가능하므로
 * 대표 계정 분실 시 이 스크립트가 유일한 복구 수단이다. .env.local(또는 .env.deploy.local)의
 * SUPABASE_SERVICE_ROLE_KEY를 사용한다 — 유출 금지.
 */
import { createClient } from "@supabase/supabase-js";

const [username, newPassword] = process.argv.slice(2);
if (!username || !newPassword || newPassword.length < 8) {
  console.error("사용법: bun scripts/reset-trainer-password.ts <username> <new-password(8자+)>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE env가 없어요 (.env.local 확인)"); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: tr, error } = await admin.from("trainers")
  .select("auth_user_id, display_name, role").eq("username", username.toLowerCase()).maybeSingle();
if (error || !tr?.auth_user_id) { console.error("해당 username의 계정을 찾을 수 없어요:", username); process.exit(1); }

const { error: upErr } = await admin.auth.admin.updateUserById(tr.auth_user_id, { password: newPassword });
if (upErr) { console.error("변경 실패:", upErr.message); process.exit(1); }
console.log(`완료: ${tr.display_name}(${tr.role}) 비밀번호를 변경했어요.`);
