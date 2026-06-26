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
}

/**
 * Resolve the logged-in trainer from the Supabase Auth session (server only).
 * Wrapped in React `cache()` so the auth.getUser() network call + trainers query
 * run AT MOST ONCE per request, even though it's called from many data helpers.
 */
export const getTrainerContext = cache(async (): Promise<TrainerContext | null> => {
  const sb = await createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("trainers")
    .select("id, username, display_name, role, must_change_password, status")
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
  };
});

/** Resolve the logged-in member from the signed cookie (server only, request-cached). */
export const getMemberContext = cache(async (): Promise<MemberSession | null> => {
  const c = await cookies();
  return verifySession(c.get(MEMBER_COOKIE)?.value);
});
