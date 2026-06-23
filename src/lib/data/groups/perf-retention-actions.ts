"use server";
import { revalidatePath } from "next/cache";
import { sb, getTrainerContext, todayISO, dayDiff } from "@/lib/data/db";

/** Mark a single member's active membership as guided (재등록 안내 완료). */
export async function markGuided(memberId: string): Promise<{ ok: boolean; error?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };

  // Scope: owner may guide any member; instructor only their own.
  if (t.role !== "owner") {
    const { data: link } = await sb
      .from("member_trainers")
      .select("member_id")
      .eq("trainer_id", t.id)
      .eq("member_id", memberId)
      .maybeSingle();
    if (!link) return { ok: false, error: "담당 회원이 아니에요" };
  }

  const { error } = await sb
    .from("memberships")
    .update({ guided: true })
    .eq("member_id", memberId)
    .eq("status", "active");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/t/retention");
  revalidatePath("/t/perf");
  return { ok: true };
}

/** Mark every expiring (active, within 14 days) member in scope as guided.
 *  Owner ⇒ studio-wide; instructor ⇒ their own assigned members only. */
export async function markAllGuided(): Promise<{ ok: boolean; error?: string }> {
  const t = await getTrainerContext();
  if (!t) return { ok: false, error: "로그인이 필요해요" };

  // Owner targets the whole studio; instructor only their own members.
  let msQuery = sb
    .from("memberships")
    .select("id, member_id, end_date, status, guided")
    .eq("status", "active");

  if (t.role !== "owner") {
    const { data: links } = await sb
      .from("member_trainers")
      .select("member_id")
      .eq("trainer_id", t.id);
    const memberIds = Array.from(new Set((links ?? []).map((l) => l.member_id)));
    if (memberIds.length === 0) return { ok: true };
    msQuery = msQuery.in("member_id", memberIds);
  }

  const { data: memberships } = await msQuery;

  const today = todayISO();
  const targetIds = (memberships ?? [])
    .filter((m) => {
      const d = dayDiff(today, m.end_date);
      return d >= 0 && d <= 14 && !m.guided;
    })
    .map((m) => m.id);

  if (targetIds.length > 0) {
    const { error } = await sb
      .from("memberships")
      .update({ guided: true })
      .in("id", targetIds);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/t/retention");
  revalidatePath("/t/perf");
  return { ok: true };
}
