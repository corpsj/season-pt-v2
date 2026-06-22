import "server-only";
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

/** Resolve the logged-in trainer from the Supabase Auth session (server only). */
export async function getTrainerContext(): Promise<TrainerContext | null> {
  const sb = await createSupabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("trainers")
    .select("id, username, display_name, role, must_change_password")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    displayName: data.display_name,
    role: data.role,
    mustChangePassword: data.must_change_password,
  };
}

/** Resolve the logged-in member from the signed cookie (server only). */
export async function getMemberContext(): Promise<MemberSession | null> {
  const c = await cookies();
  return verifySession(c.get(MEMBER_COOKIE)?.value);
}
