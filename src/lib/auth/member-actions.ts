"use server";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { hashPassword, verifyPassword } from "./password";
import { getMemberContext } from "./context";
import { MEMBER_COOKIE, signSession } from "./session";

type Result = { ok: boolean; error?: string };

const normPhone = (p: string) => p.replace(/\D/g, "");

// 미존재 회원도 동일하게 scrypt를 돌려 응답시간 차이로 가입여부가 새지 않게 한다(timing oracle 차단).
const DUMMY_HASH = `scrypt$${"0".repeat(32)}$${"0".repeat(64)}`;
const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

type Admin = ReturnType<typeof createSupabaseAdmin>;
// 레이트리밋은 부가 방어막 — 테이블이 없거나 오류면 로그인 자체는 막지 않는다(fail-open on throttle).
async function isLocked(admin: Admin, phone: string): Promise<boolean> {
  try {
    const { data } = await admin.from("member_login_attempts").select("locked_until").eq("phone", phone).maybeSingle();
    return !!data?.locked_until && new Date(data.locked_until as string).getTime() > Date.now();
  } catch { return false; }
}
async function recordFail(admin: Admin, phone: string): Promise<void> {
  try {
    const { data } = await admin.from("member_login_attempts").select("fail_count").eq("phone", phone).maybeSingle();
    const fail = ((data?.fail_count as number) ?? 0) + 1;
    await admin.from("member_login_attempts").upsert({
      phone, fail_count: fail,
      locked_until: fail >= MAX_FAILS ? new Date(Date.now() + LOCK_MS).toISOString() : null,
      updated_at: new Date().toISOString(),
    });
  } catch { /* throttle is best-effort */ }
}
async function clearFails(admin: Admin, phone: string): Promise<void> {
  try { await admin.from("member_login_attempts").delete().eq("phone", phone); } catch { /* best-effort */ }
}

export async function memberLogin(phone: string, password: string): Promise<Result> {
  const admin = createSupabaseAdmin();
  const p = normPhone(phone);
  if (await isLocked(admin, p)) return { ok: false, error: "로그인 시도가 많아요. 약 10분 후 다시 시도해주세요" };
  const { data: member } = await admin
    .from("members")
    .select("id, name, password_hash")
    .eq("phone", p)
    .maybeSingle();
  const ok = verifyPassword(password.trim(), member?.password_hash ?? DUMMY_HASH);
  if (!member || !ok) {
    await recordFail(admin, p);
    return { ok: false, error: "휴대폰 번호 또는 비밀번호를 확인해주세요" };
  }
  await clearFails(admin, p);
  const token = await signSession({ memberId: member.id, name: member.name });
  const c = await cookies();
  c.set(MEMBER_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return { ok: true };
}

export async function memberLogout(): Promise<void> {
  const c = await cookies();
  c.delete(MEMBER_COOKIE);
}

/** 회원 비밀번호 변경. 현재 비밀번호 확인 후 교체(생년월일 고정 문제 해소). */
export async function changeMemberPassword(current: string, next: string): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "로그인이 필요해요" };
  const np = next.trim();
  if (np.length < 4) return { ok: false, error: "비밀번호는 4자 이상으로 설정해주세요" };
  const admin = createSupabaseAdmin();
  const { data: m } = await admin.from("members").select("password_hash").eq("id", me.memberId).maybeSingle();
  if (!m || !verifyPassword(current.trim(), m.password_hash)) {
    return { ok: false, error: "현재 비밀번호가 일치하지 않아요" };
  }
  const { error } = await admin.from("members").update({ password_hash: hashPassword(np) }).eq("id", me.memberId);
  if (error) return { ok: false, error: "변경에 실패했어요" };
  return { ok: true };
}
