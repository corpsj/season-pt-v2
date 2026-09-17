import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { MEMBER_COOKIE, verifySession, type MemberSession } from "./session";

export interface TrainerContext {
  id: string;
  username: string;
  displayName: string;
  role: "owner" | "instructor";
  mustChangePassword: boolean;
  /** 로그인 아이디가 아직 본인 전화번호(발급 시 임시 아이디)인 채로 남아있는지 — true면 set-password에서 진짜 아이디도 함께 설정받아야 한다. */
  needsUsername: boolean;
}

/**
 * Resolve the logged-in trainer from the Supabase Auth session (server only).
 * Wrapped in React `cache()` so the auth.getUser() network call + trainers query
 * run AT MOST ONCE per request, even though it's called from many data helpers.
 */
export const getTrainerSetupContext = cache(async (): Promise<TrainerContext | null> => {
  const sb = await createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("trainers")
    .select("id, username, display_name, role, must_change_password, status, phone")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  if (data.status === "inactive") return null; // 비활성 강사는 로그인돼 있어도 접근 차단
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    role: data.role,
    mustChangePassword: data.must_change_password,
    needsUsername: !!data.phone && data.username === data.phone,
  };
});

/**
 * Operational trainer context. A phone-only first login creates a short-lived
 * authenticated setup session, but that session must not authorize attendance,
 * scheduling, finance, chat, or other Server Actions before credentials are set.
 */
export const getTrainerContext = cache(async (): Promise<TrainerContext | null> => {
  const trainer = await getTrainerSetupContext();
  return trainer?.mustChangePassword ? null : trainer;
});

/**
 * Resolve the logged-in member from the signed cookie (server only, request-cached).
 * A valid signature is not enough: deleted/inactive members must lose access immediately,
 * rather than keeping a renewable 30-day cookie until it expires.
 */
export const getMemberContext = cache(async (): Promise<MemberSession | null> => {
  const c = await cookies();
  const session = await verifySession(c.get(MEMBER_COOKIE)?.value);
  if (!session) return null;

  const admin = createSupabaseAdmin();
  const { data: member, error } = await admin
    .from("members")
    .select("id, name, status")
    .eq("id", session.memberId)
    .maybeSingle();
  // Auth checks fail closed on database errors, missing rows, and 탈퇴(inactive).
  if (error || !member || member.status === "inactive") return null;

  // Keep display data current even when the signed cookie predates a name correction.
  return { ...session, name: member.name };
});

/**
 * 실제 스튜디오 대표(개발자 관리용 admin 대표 제외) 존재 여부 — 최초 대표 회원가입 진입점 노출용.
 * 개발자 관리 대표(bootstrap_admin=true)는 카운트에서 빼므로, 그 계정이 있어도 진짜 대표가 가입 전이면
 * 로그인·콘솔에 가입 메뉴가 보인다. 진짜 대표가 가입하면 true→메뉴가 사라지고 ownerSignup도 서버에서 거부.
 * (단일 스튜디오라 admin·실대표는 같은 데이터를 자동 공유.)
 */
export const studioOwnerExists = cache(async (): Promise<boolean> => {
  const admin = createSupabaseAdmin();
  const { count } = await admin
    .from("trainers")
    .select("id", { count: "exact", head: true })
    .eq("role", "owner")
    .eq("bootstrap_admin", false);
  return (count ?? 0) > 0;
});
