"use server";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureOwner, OWNER_ONLY_ERROR } from "@/lib/auth/guard";

const DOMAIN = process.env.TRAINER_EMAIL_DOMAIN || "trainer.seasonpt.local";
const toEmail = (u: string) => `${u.trim().toLowerCase()}@${DOMAIN}`;

type Result = { ok: boolean; error?: string; mustChangePassword?: boolean };

export async function ownerSignup(username: string, password: string): Promise<Result> {
  const admin = createSupabaseAdmin();
  // 부트스트랩 전용: 이미 대표가 있으면 자가가입 거부. 단일 스튜디오라 누구나 공동대표로
  // 탈취하는 것을 막는다(대표 추가는 강사 초대/직접 DB로만).
  const { count } = await admin.from("trainers").select("id", { count: "exact", head: true }).eq("role", "owner");
  if ((count ?? 0) > 0) return { ok: false, error: "이미 대표 계정이 있어요. 대표에게 강사 초대를 요청하세요." };
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(uname)) return { ok: false, error: "아이디는 영문 소문자·숫자·점(.)으로 3~20자로 입력해주세요" };
  if (!password || password.length < 8) return { ok: false, error: "비밀번호는 8자 이상이어야 해요" };
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(uname),
    password,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "이미 사용 중인 아이디이거나 가입에 실패했어요" };
  const { error: insErr } = await admin.from("trainers").insert({
    auth_user_id: created.user.id,
    username: uname,
    display_name: username.trim(),
    role: "owner",
    status: "active",
  });
  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {}); // 고아 auth 계정 방지
    return { ok: false, error: "가입에 실패했어요. 다시 시도해주세요" };
  }
  const sb = await createSupabaseServer();
  await sb.auth.signInWithPassword({ email: toEmail(uname), password });
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
    .select("must_change_password, status")
    .eq("auth_user_id", user!.id)
    .maybeSingle();
  if (data?.status === "inactive") {
    await sb.auth.signOut();
    return { ok: false, error: "비활성화된 계정이에요. 대표에게 문의해주세요." };
  }
  return { ok: true, mustChangePassword: !!data?.must_change_password };
}

export async function setTrainerPassword(newPassword: string): Promise<Result> {
  const sb = await createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "세션이 만료됐어요. 다시 로그인해주세요" };
  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword))
    return { ok: false, error: "비밀번호는 8자 이상, 영문과 숫자를 포함해주세요" };
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  const admin = createSupabaseAdmin();
  // 초대(invited) 강사의 첫 비번 설정만 active로 전환. 대표가 비활성(inactive)한 강사가
  // 비번 변경으로 스스로 재활성화하는 것은 막는다.
  const { data: tr } = await admin.from("trainers").select("status").eq("auth_user_id", user.id).maybeSingle();
  const patch: { must_change_password: boolean; status?: string } = { must_change_password: false };
  if (tr?.status === "invited") patch.status = "active";
  await admin.from("trainers").update(patch).eq("auth_user_id", user.id);
  return { ok: true };
}

export async function inviteInstructor(
  name: string,
  phone: string,
  username: string
): Promise<Result & { username?: string; tempPassword?: string }> {
  if (!(await ensureOwner())) return { ok: false, error: OWNER_ONLY_ERROR };
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(uname))
    return { ok: false, error: "아이디는 영문 소문자·숫자·점(.)으로 3~20자로 입력해주세요" };
  const admin = createSupabaseAdmin();
  const { data: exists } = await admin.from("trainers").select("id").eq("username", uname).maybeSingle();
  if (exists) return { ok: false, error: "이미 사용 중인 아이디예요" };
  const tempPassword = String(Math.floor(100000 + Math.random() * 900000)); // 랜덤 6자리 숫자
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(uname),
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "이미 사용 중인 아이디이거나 생성에 실패했어요" };
  await admin.from("trainers").insert({
    auth_user_id: created.user.id,
    username: uname,
    display_name: name.trim() || uname,
    role: "instructor",
    status: "invited",
    must_change_password: true,
    phone: phone.trim() || null,
  });
  return { ok: true, username: uname, tempPassword };
}

export async function trainerLogout(): Promise<void> {
  const sb = await createSupabaseServer();
  await sb.auth.signOut();
}

/* --------------------------- 강사 관리 (대표 전용) --------------------------- */

/** Fetch a target instructor row scoped to its id. Returns null if missing. */
async function fetchTrainer(admin: ReturnType<typeof createSupabaseAdmin>, id: string) {
  const { data } = await admin
    .from("trainers")
    .select("id, role, status, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  return data as { id: string; role: "owner" | "instructor"; status: string; auth_user_id: string } | null;
}

/** 강사 정보 수정 (이름·연락처). 대표 전용. */
export async function updateInstructor(id: string, name: string, phone: string): Promise<Result> {
  const me = await ensureOwner();
  if (!me) return { ok: false, error: OWNER_ONLY_ERROR };
  const display = name.trim();
  if (!display) return { ok: false, error: "이름을 입력해주세요" };
  const admin = createSupabaseAdmin();
  const target = await fetchTrainer(admin, id);
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정은 여기서 수정할 수 없어요" };
  const { error } = await admin
    .from("trainers")
    .update({ display_name: display, phone: phone.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: "수정에 실패했어요" };
  revalidatePath("/t/staff");
  revalidatePath(`/t/staff/${id}`);
  return { ok: true };
}

/** 강사 활성/비활성 전환. 대표 전용. 비활성 강사는 로그인은 가능하나 운영에서 비활성으로 표시. */
export async function setInstructorActive(id: string, active: boolean): Promise<Result> {
  const me = await ensureOwner();
  if (!me) return { ok: false, error: OWNER_ONLY_ERROR };
  const admin = createSupabaseAdmin();
  const target = await fetchTrainer(admin, id);
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정은 비활성화할 수 없어요" };
  const { error } = await admin
    .from("trainers")
    .update({ status: active ? "active" : "inactive" })
    .eq("id", id);
  if (error) return { ok: false, error: "상태 변경에 실패했어요" };
  revalidatePath("/t/staff");
  revalidatePath(`/t/staff/${id}`);
  return { ok: true };
}

/** 강사 삭제. 대표 전용. 담당 회원이 있으면 거부(먼저 비활성화/재배정). 계정까지 완전 삭제. */
export async function deleteInstructor(id: string): Promise<Result> {
  const me = await ensureOwner();
  if (!me) return { ok: false, error: OWNER_ONLY_ERROR };
  if (id === me.id) return { ok: false, error: "본인 계정은 삭제할 수 없어요" };
  const admin = createSupabaseAdmin();
  const target = await fetchTrainer(admin, id);
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정은 삭제할 수 없어요" };

  const { count } = await admin
    .from("member_trainers")
    .select("member_id", { count: "exact", head: true })
    .eq("trainer_id", id);
  if ((count ?? 0) > 0)
    return { ok: false, error: "담당 회원이 있어 삭제할 수 없어요. 먼저 비활성화하거나 회원을 재배정하세요." };

  // null out non-cascading references so the row delete isn't blocked
  await admin.from("payments").update({ recorded_by: null }).eq("recorded_by", id);
  await admin.from("attendance_ledger").update({ created_by: null }).eq("created_by", id);
  await admin.from("workout_records").update({ created_by: null }).eq("created_by", id);

  // delete the auth user → cascades the trainers row (auth_user_id ON DELETE CASCADE)
  if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id);
  await admin.from("trainers").delete().eq("id", id); // in case the row had no auth user

  revalidatePath("/t/staff");
  return { ok: true };
}
