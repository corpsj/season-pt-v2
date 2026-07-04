"use server";
import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { ensureOwner, OWNER_ONLY_ERROR } from "@/lib/auth/guard";
import { getTrainerContext } from "@/lib/auth/context";
import { encryptCredential } from "@/lib/auth/credential-crypto";

const DOMAIN = process.env.TRAINER_EMAIL_DOMAIN || "trainer.seasonpt.local";
const toEmail = (u: string) => `${u.trim().toLowerCase()}@${DOMAIN}`;

// CSPRNG 8자리 임시비번 — 혼동 문자(l/1, o/0) 제외. 초대·재발급·계정 발급 공용.
const ALPHANUM = "abcdefghjkmnpqrstuvwxyz23456789";
const genTempPassword = () => Array.from({ length: 8 }, () => ALPHANUM[randomInt(ALPHANUM.length)]).join("");

type Result = { ok: boolean; error?: string; mustChangePassword?: boolean };

export async function ownerSignup(username: string, password: string, name: string): Promise<Result> {
  const admin = createSupabaseAdmin();
  // 부트스트랩 전용: 실제 스튜디오 대표(개발자 관리용 admin 대표 제외)가 이미 있으면 자가가입 거부.
  // 개발자 관리 대표(bootstrap_admin=true)는 카운트에서 빼므로 진짜 대표 1명은 가입할 수 있고,
  // 그 뒤론 URL을 아는 누군가가 공동대표로 탈취하는 것을 막는다(추가 대표는 강사 초대/직접 DB로만).
  const { count } = await admin
    .from("trainers")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("bootstrap_admin", false);
  if ((count ?? 0) > 0) return { ok: false, error: "이미 대표 계정이 있어요. 대표에게 강사 초대를 요청하세요." };
  const uname = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,20}$/.test(uname)) return { ok: false, error: "아이디는 영문 소문자·숫자·점(.)으로 3~20자로 입력해주세요" };
  if (!password || password.length < 8) return { ok: false, error: "비밀번호는 8자 이상이어야 해요" };
  const display = name.trim();
  if (!display) return { ok: false, error: "이름을 입력해주세요" };
  if (display.length > 20) return { ok: false, error: "이름은 20자 이하로 입력해주세요" };
  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(uname),
    password,
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "이미 사용 중인 아이디이거나 가입에 실패했어요" };
  const { error: insErr } = await admin.from("trainers").insert({
    auth_user_id: created.user.id,
    username: uname,
    display_name: display,
    role: "owner",
    status: "active",
    credential_enc: encryptCredential(password),
  });
  if (insErr) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => {}); // 고아 auth 계정 방지
    return { ok: false, error: "가입에 실패했어요. 다시 시도해주세요" };
  }
  const sb = await createSupabaseServer();
  await sb.auth.signInWithPassword({ email: toEmail(uname), password });
  return { ok: true };
}

/** 본인 표시 이름 변경(자기 계정만). 가입 때 이름을 못 받았거나 오타를 고치는 경로. */
export async function updateMyName(name: string): Promise<Result> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };
  const display = name.trim();
  if (!display) return { ok: false, error: "이름을 입력해주세요" };
  if (display.length > 20) return { ok: false, error: "이름은 20자 이하로 입력해주세요" };
  const admin = createSupabaseAdmin();
  const { error } = await admin.from("trainers").update({ display_name: display }).eq("id", t.id);
  if (error) return { ok: false, error: "이름 변경에 실패했어요" };
  revalidatePath("/t/settings");
  revalidatePath("/t");
  revalidatePath("/console");
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

/** newUsername이 오면(첫 로그인 시 전화번호 자리 아이디를 진짜 아이디로 교체) 아이디도 함께 확정. */
export async function setTrainerPassword(newPassword: string, newUsername?: string): Promise<Result> {
  const sb = await createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false, error: "세션이 만료됐어요. 다시 로그인해주세요" };
  if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword))
    return { ok: false, error: "비밀번호는 8자 이상, 영문과 숫자를 포함해주세요" };
  const admin = createSupabaseAdmin();
  const { data: tr } = await admin.from("trainers").select("status, username").eq("auth_user_id", user.id).maybeSingle();
  let uname = tr?.username; // 로그인 이메일·재로그인에 쓸 최종 아이디(변경 없으면 현재 값)
  if (newUsername !== undefined) {
    const u = newUsername.trim().toLowerCase();
    if (!/^[a-z0-9._-]{3,20}$/.test(u))
      return { ok: false, error: "아이디는 영문 소문자·숫자·점(.)으로 3~20자로 입력해주세요" };
    const { data: dup } = await admin.from("trainers").select("id").eq("username", u).neq("auth_user_id", user.id).maybeSingle();
    if (dup) return { ok: false, error: "이미 사용 중인 아이디예요" };
    uname = u;
  }
  // 아이디가 바뀌면 로그인 이메일(=아이디@도메인)도 같이 바꿔야 새 아이디로 로그인된다
  // — trainers.username만 바꾸면 실제 Auth 이메일은 그대로라 로그인 불가.
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: newPassword,
    ...(newUsername !== undefined && uname ? { email: toEmail(uname), email_confirm: true } : {}),
  });
  if (error) return { ok: false, error: error.message };
  // 초대(invited) 강사의 첫 비번 설정만 active로 전환. 대표가 비활성(inactive)한 강사가
  // 비번 변경으로 스스로 재활성화하는 것은 막는다.
  const patch: { must_change_password: boolean; status?: string; credential_enc: string; username?: string } = {
    must_change_password: false,
    credential_enc: encryptCredential(newPassword),
  };
  if (tr?.status === "invited") patch.status = "active";
  if (newUsername !== undefined) patch.username = uname;
  const { error: upErr } = await admin.from("trainers").update(patch).eq("auth_user_id", user.id);
  if (upErr) return { ok: false, error: "아이디 설정에 실패했어요. 다른 아이디를 입력해주세요" };
  // 이메일·비번을 admin으로 바꾸면 브라우저가 들고 있던 기존 세션이 무효화된다(Auth session missing).
  // 새 자격증명으로 서버에서 다시 로그인해 쿠키를 갱신해야 이후 /t 이동이 정상 동작한다(ownerSignup과 동일).
  if (uname) await sb.auth.signInWithPassword({ email: toEmail(uname), password: newPassword });
  return { ok: true };
}

/**
 * 강사 첫 로그인: 비밀번호 없이 본인 전화번호만으로 로그인. issueInstructorLogin이 만든 auth 계정은
 * 비밀번호가 없는 상태라 signInWithPassword를 못 쓰므로, 이 요청 안에서만 쓰고 버릴 1회성 랜덤
 * 비밀번호를 설정한 뒤 곧바로 그 값으로 로그인한다(임시비번을 따로 발급·전달·저장할 필요가 없어짐).
 * must_change_password가 여전히 true인(=아직 진짜 아이디·비번을 설정 안 한) 계정만 대상.
 */
export async function trainerFirstLogin(phone: string): Promise<Result> {
  const uname = phone.replace(/\D/g, "");
  if (uname.length < 9) return { ok: false, error: "전화번호를 정확히 입력해주세요" };
  const admin = createSupabaseAdmin();
  const { data: tr } = await admin
    .from("trainers")
    .select("auth_user_id, status")
    .eq("username", uname)
    .eq("must_change_password", true)
    .maybeSingle();
  if (!tr?.auth_user_id) return { ok: false, error: "등록된 강사 전화번호가 아니거나 이미 설정을 마쳤어요" };
  if (tr.status === "inactive") return { ok: false, error: "비활성화된 계정이에요. 대표에게 문의해주세요." };
  const ephemeral = genTempPassword() + genTempPassword();
  const { error: pwErr } = await admin.auth.admin.updateUserById(tr.auth_user_id, { password: ephemeral });
  if (pwErr) return { ok: false, error: "로그인에 실패했어요. 다시 시도해주세요." };
  const sb = await createSupabaseServer();
  const { error: signErr } = await sb.auth.signInWithPassword({ email: toEmail(uname), password: ephemeral });
  if (signErr) return { ok: false, error: "로그인에 실패했어요. 다시 시도해주세요." };
  return { ok: true, mustChangePassword: true };
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
 * 명단에만 있던 강사(로그인 계정 없음)에게 로그인 계정을 발급. 로그인 아이디는 강사 본인 전화번호로
 * 고정(대표가 따로 아이디를 정할 필요 없음) — 비밀번호는 만들지 않는다(첫 로그인은 trainerFirstLogin이
 * 전화번호만으로 처리). 첫 로그인 후 본인이 진짜 아이디·비밀번호를 설정한다(setTrainerPassword).
 */
export async function issueInstructorLogin(id: string): Promise<Result & { username?: string }> {
  if (!(await ensureOwner())) return { ok: false, error: OWNER_ONLY_ERROR };
  const admin = createSupabaseAdmin();
  const { data: target } = await admin
    .from("trainers")
    .select("id, role, auth_user_id, phone")
    .eq("id", id)
    .maybeSingle();
  if (!target) return { ok: false, error: "강사를 찾을 수 없어요" };
  if (target.role === "owner") return { ok: false, error: "대표 계정이에요" };
  if (target.auth_user_id) return { ok: false, error: "이미 로그인 계정이 있는 강사예요" };
  const uname = (target.phone ?? "").replace(/\D/g, "");
  if (uname.length < 9) return { ok: false, error: "강사 연락처가 없어요. 먼저 연락처를 등록해주세요" };
  const { data: dup } = await admin.from("trainers").select("id").eq("username", uname).maybeSingle();
  if (dup) return { ok: false, error: "이미 같은 전화번호로 발급된 계정이 있어요" };

  const { data: created, error } = await admin.auth.admin.createUser({
    email: toEmail(uname),
    email_confirm: true,
  });
  if (error || !created.user) return { ok: false, error: "계정 발급에 실패했어요" };
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
  return { ok: true, username: uname };
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
  // 대표는 본인 계정만 수정 가능(이름·연락처). 다른 대표는 여기서 못 건드림 — 삭제·비활성화는 별도 액션에서 여전히 차단.
  if (target.role === "owner" && target.id !== me.id) return { ok: false, error: "다른 대표 계정은 여기서 수정할 수 없어요" };
  const { error } = await admin
    .from("trainers")
    .update({ display_name: display, phone: phone.trim() || null })
    .eq("id", id);
  if (error) return { ok: false, error: "수정에 실패했어요" };
  revalidatePath("/t/staff");
  revalidatePath(`/t/staff/${id}`);
  revalidatePath("/console/trainers");
  revalidatePath("/console");
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
  const { error: flagErr } = await admin
    .from("trainers")
    .update({ must_change_password: true, credential_enc: encryptCredential(tempPassword) })
    .eq("id", id);
  if (flagErr) return { ok: false, error: "비밀번호는 바뀌었지만 변경 강제 설정에 실패했어요. 다시 시도해주세요." };
  return { ok: true, tempPassword };
}
