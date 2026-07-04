/**
 * 개발자 전용: trainers.credential_enc에 암호화 저장된 현재 비밀번호를 복호화해 확인.
 * 앱에는 노출되지 않음(대표는 초기화만 가능) — 이 스크립트는 CREDENTIAL_ENC_KEY를 아는
 * 개발자가 로컬에서만 실행. 사용: bun scripts/view-trainer-password.ts <username>
 */
import { createClient } from "@supabase/supabase-js";
import { decryptCredential } from "../src/lib/auth/credential-crypto";

const [username] = process.argv.slice(2);
if (!username) {
  console.error("사용법: bun scripts/view-trainer-password.ts <username>");
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("SUPABASE env가 없어요 (.env.local 확인)"); process.exit(1); }

const admin = createClient(url, key, { auth: { persistSession: false } });
const { data: tr, error } = await admin.from("trainers")
  .select("display_name, role, credential_enc").eq("username", username.toLowerCase()).maybeSingle();
if (error || !tr) { console.error("해당 username의 계정을 찾을 수 없어요:", username); process.exit(1); }
if (!tr.credential_enc) { console.error("저장된 비밀번호가 없어요(계정 생성 이전 데이터이거나 아직 미기록)"); process.exit(1); }

console.log(`${tr.display_name}(${tr.role}) 현재 비밀번호: ${decryptCredential(tr.credential_enc)}`);
