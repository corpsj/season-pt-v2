import "server-only";
import { redirect } from "next/navigation";
import { getTrainerContext, type TrainerContext } from "@/lib/auth/context";

/**
 * Owner-only enforcement (the service-role client bypasses RLS, so role gating lives here).
 *
 * `requireOwnerPage()` — call at the top of an owner-only server page; non-owners are
 * redirected to /t. `ensureOwner()` — call at the top of an owner-only server action;
 * returns the owner context or null so the action can return a friendly error.
 */
export async function requireOwnerPage(): Promise<TrainerContext> {
  const t = await getTrainerContext();
  if (!t || t.role !== "owner") redirect("/t");
  return t;
}

export async function ensureOwner(): Promise<TrainerContext | null> {
  const t = await getTrainerContext();
  return t && t.role === "owner" ? t : null;
}

export const OWNER_ONLY_ERROR = "대표만 사용할 수 있는 기능이에요.";
