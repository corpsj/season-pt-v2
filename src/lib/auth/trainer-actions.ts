"use server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";

const DOMAIN = process.env.TRAINER_EMAIL_DOMAIN || "trainer.seasonpt.local";
const toEmail = (u: string) => `${u.trim().toLowerCase()}@${DOMAIN}`;

type Result = { ok: boolean; error?: string; mustChangePassword?: boolean };

export async function ownerSignup(username: string, password: string): Promise<Result> {
  const admin = createSupabaseAdmin();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(username),
    password,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "이미 사용 중인 아이디이거나 가입에 실패했어요" };
  await admin.from("trainers").insert({
    auth_user_id: created.user.id,
    username: username.trim().toLowerCase(),
    display_name: username.trim(),
    role: "owner",
    status: "active",
  });
  const sb = await createSupabaseServer();
  await sb.auth.signInWithPassword({ email: toEmail(username), password });
  return { ok: true };
}

export async function trainerLogin(username: string, password: string): Promise<Result> {
  const sb = await createSupabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email: toEmail(username), password });
  if (error) return { ok: false, error: "아이디 또는 비밀번호를 확인해주세요" };
  const {
    data: { user },
  } = await sb.auth.getUser();
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("trainers")
    .select("must_change_password")
    .eq("auth_user_id", user!.id)
    .maybeSingle();
  return { ok: true, mustChangePassword: !!data?.must_change_password };
}

export async function setTrainerPassword(newPassword: string): Promise<Result> {
  const sb = await createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "세션이 만료됐어요. 다시 로그인해주세요" };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  const admin = createSupabaseAdmin();
  await admin.from("trainers").update({ must_change_password: false, status: "active" }).eq("auth_user_id", user.id);
  return { ok: true };
}

export async function inviteInstructor(
  name: string,
  phone: string
): Promise<Result & { username?: string; tempPassword?: string }> {
  const admin = createSupabaseAdmin();
  const suffix = Math.floor(1000 + Math.random() * 9000);
  const username = `gyeaul.t${suffix}`;
  const tempPassword = `ptss-${Math.floor(1000 + Math.random() * 9000)}`;
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(username),
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "강사 계정 생성에 실패했어요" };
  await admin.from("trainers").insert({
    auth_user_id: created.user.id,
    username,
    display_name: name.trim() || username,
    role: "instructor",
    status: "invited",
    must_change_password: true,
    phone: phone.trim() || null,
  });
  return { ok: true, username, tempPassword };
}

export async function trainerLogout(): Promise<void> {
  const sb = await createSupabaseServer();
  await sb.auth.signOut();
}
