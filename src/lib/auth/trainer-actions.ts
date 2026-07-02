"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureOwner, OWNER_ONLY_ERROR } from "@/lib/auth/guard";

const DOMAIN = process.env.TRAINER_EMAIL_DOMAIN || "trainer.seasonpt.local";
const toEmail = (u: string) => `${u.trim().toLowerCase()}@${DOMAIN}`;

// CSPRNG 8자리 임시비번 — 혼동 문자(l/1, o/0) 제외. 초대·재발급·계정 발급 공용.
const ALPHANUM = "abcdefghjkmnpqrstuvwxyz23456789";
const genTempPassword = () => Array.from({ length: 8 }, () => ALPHANUM[randomInt(ALPHANUM.length)]).join("");

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
  const tempPassword = genTempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(uname),
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "이미 사용 중인 아이디이거나 생성에 실패했어요" };
  const { error: insErr } = await admin.from("trainers").insert({
    auth_user_id: created.user.id,
    username: uname,
    display_name: name.trim() || uname,
    role: "instructor",
    status: "invited",
    must_change_password: true,
    phone: phone.trim() || null,
  });
  if (insErr) {
    // 실패했는데 임시비밀번호와 함께 성공 반환되고 고아 auth 계정이 남던 문제(감사 #19).
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: "강사 등록에 실패했어요. 다시 시도해주세요." };
  }
  return { ok: true, username: uname, tempPassword };
}

/**
 * 강사를 "명단에만" 등록(로그인 계정 없이). 대표가 회원을 한꺼번에 등록하기 전에 강사 이름부터
 * 올려두고 담당 배정을 할 수 있게 한다. 로그인 아이디·임시비번은 준비되면 issueInstructorLogin으로 발급.
 * username은 not-null·unique 제약을 만족시키기 위한 임시 슬러그(로그인엔 미사용, 발급 시 실제 아이디로 교체).
 */
export async function addInstructor(name: string, phone?: string): Promise<Result & { id?: string }> {
  if (!(await ensureOwner())) return { ok: false, error: OWNER_ONLY_ERROR };
  const display = name.trim();
  if (!display) return { ok: false, error: "강사 이름을 입력해주세요" };
  const admin = createSupabaseAdmin();
  const placeholderUsername = `pending_${genTempPassword()}`; // unique·미표시(발급 전까지)
  const { data, error } = await admin
    .from("trainers")
    .insert({
      auth_user_id: null,
      username: placeholderUsername,
      display_name: display,
      role: "instructor",
      status: "invited", // 로그인 전 상태(활성 강사 명단엔 아직 미포함, 담당 배정은 가능)
      must_change_password: false,
      phone: phone?.trim() || null,
    })
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "강사 등록에 실패했어요. 다시 시도해주세요." };
  revalidatePath("/t/staff");
  revalidatePath("/console/trainers");
  return { ok: true, id: data.id as string };
}

/**
 * 명단에만 있던 강사(로그인 계정 없음)에게 로그인 아이디·임시비번을 발급. inviteInstructor와 동일하게
 * auth 계정을 만들되, INSERT 대신 기존 강사 행을 UPDATE한다. 첫 로그인 시 비번 변경이 강제된다.
 */
export async function issueInstructorLogin(
  id: string,
  username: string,
): Promise<Result & { username?: string; tempPassword?: string }> {
  if (!(await ensureOwner())) return { ok: false, error: OWNER_ONLY_ERROR };
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(uname))
    return { ok: false, error: "아이디는 영문 소문자·숫자·점(.)으로 3~20자로 입력해주세요" };
  const admin = createSupabaseAdmin();
  const { data: target } = await admin
    .from("trainers")
    .select("id, role, auth_user_id")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정이에요" };
  if (target.auth_user_id) return { ok: false, error: "이미 로그인 계정이 있는 강사예요" };
  const { data: dup } = await admin.from("trainers").select("id").eq("username", uname).maybeSingle();
  if (dup) return { ok: false, error: "이미 사용 중인 아이디예요" };

  const tempPassword = genTempPassword();
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(uname),
    password: tempPassword,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "이미 사용 중인 아이디이거나 발급에 실패했어요" };
  const { data: updated, error: upErr } = await admin
    .from("trainers")
    .update({ auth_user_id: created.user.id, username: uname, must_change_password: true, status: "invited" })
    .eq("id", id)
    .is("auth_user_id", null) // 원자 클레임: 여전히 계정 없을 때만 — 동시/이중 발급 방지
    .select("id");
  if (upErr || !updated || updated.length === 0) {
    // 클레임 실패(동시 발급으로 이미 링크됨) 또는 오류 → 방금 만든 auth 계정을 회수(고아 방지, 감사 #19).
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {});
    return { ok: false, error: "계정 발급에 실패했어요. 다시 시도해주세요." };
  }
  revalidatePath("/t/staff");
  revalidatePath(`/t/staff/${id}`);
  revalidatePath("/console/trainers");
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

  // 과거 수업/일정이 있으면 hard-delete가 sessions·schedules를 cascade로 지운다(출석·매출귀속 기록 소실).
  // 이력 보존을 위해 삭제 대신 비활성화를 쓰게 한다(E4로 비활성 강사는 접근 차단됨).
  const { count: sessCount } = await admin.from("sessions").select("id", { count: "exact", head: true }).eq("trainer_id", id);
  if ((sessCount ?? 0) > 0)
    return { ok: false, error: "과거 수업 기록이 있어 삭제할 수 없어요. 대신 비활성화를 사용하세요(기록 보존)." };

  // null out non-cascading references so the row delete isn't blocked
  await admin.from("payments").update({ recorded_by: null }).eq("recorded_by", id);
  await admin.from("attendance_ledger").update({ created_by: null }).eq("created_by", id);
  await admin.from("workout_records").update({ created_by: null }).eq("created_by", id);
  await admin.from("expenses").update({ recorded_by: null }).eq("recorded_by", id);

  // delete the auth user → cascades the trainers row (auth_user_id ON DELETE CASCADE)
  if (target.auth_user_id) await admin.auth.admin.deleteUser(target.auth_user_id);
  await admin.from("trainers").delete().eq("id", id); // in case the row had no auth user

  revalidatePath("/t/staff");
  return { ok: true };
}

/** 강사 비밀번호 초기화. 대표 전용. 임시비밀번호를 발급하고 첫 로그인 시 변경을 강제한다. */
export async function resetInstructorPassword(id: string): Promise<Result & { tempPassword?: string }> {
  const me = await ensureOwner();
  if (!me) return { ok: false, error: OWNER_ONLY_ERROR };
  const admin = createSupabaseAdmin();
  const target = await fetchTrainer(admin, id);
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정은 초기화할 수 없어요. scripts/reset-trainer-password.ts를 사용하세요." };
  if (!target.auth_user_id) return { ok: false, error: "로그인 계정이 아직 없어요. 먼저 로그인 계정을 발급하세요." };
  const tempPassword = genTempPassword();
  const { error } = await admin.auth.admin.updateUserById(target.auth_user_id, { password: tempPassword });
  if (error) return { ok: false, error: "초기화에 실패했어요. 다시 시도해주세요." };
  // 비번은 이미 바뀜 — 변경강제 플래그 실패를 삼키면 첫 로그인 변경강제가 안 걸린다. 재시도는 새 임시비번으로 안전하게 재발급됨.
  const { error: flagErr } = await admin.from("trainers").update({ must_change_password: true }).eq("id", id);
  if (flagErr) return { ok: false, error: "비밀번호는 바뀌었지만 변경 강제 설정에 실패했어요. 다시 시도해주세요." };
  return { ok: true, tempPassword };
}
