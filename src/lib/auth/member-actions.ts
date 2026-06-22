"use server";
import { cookies } from "next/headers";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { verifyPassword } from "./password";
import { MEMBER_COOKIE, signSession } from "./session";

type Result = { ok: boolean; error?: string };

const normPhone = (p: string) => p.replace(/\D/g, "");

export async function memberLogin(phone: string, password: string): Promise<Result> {
  const admin = createSupabaseAdmin();
  const { data: member } = await admin
    .from("members")
    .select("id, name, password_hash")
    .eq("phone", normPhone(phone))
    .maybeSingle();
  if (!member || !verifyPassword(password.trim(), member.password_hash)) {
    return { ok: false, error: "휴대폰 번호 또는 비밀번호를 확인해주세요" };
  }
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
