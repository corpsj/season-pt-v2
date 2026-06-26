// 운영 검증/프리워밍: maintenance.ts(만료 전이 + 미래 세션 생성)를 운영 DB에 1회 실행.
// 배포된 코드와 동일한 supabase 쿼리 경로를 그대로 재현. 멱등(중복 슬롯 skip).
// 실행: bun run scripts/run-maintenance.ts
import { createClient } from "@supabase/supabase-js";
import { kstSlotInstant } from "../src/lib/data/kst-bounds";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const sb = createClient(url, key, { auth: { persistSession: false } });

const KST_OFFSET_MS = 9 * 3600000;
const todayISO = () => new Date(Date.now() + KST_OFFSET_MS).toISOString().slice(0, 10);

async function latestScheduled(): Promise<string> {
  const { data } = await sb.from("sessions").select("scheduled_at").eq("status", "scheduled").order("scheduled_at", { ascending: false }).limit(1).maybeSingle();
  return data?.scheduled_at ?? "(none)";
}

async function flipExpired(): Promise<number> {
  const { data } = await sb.from("memberships").update({ status: "expired" }).eq("status", "active").lt("end_date", todayISO()).select("id");
  return (data ?? []).length;
}

async function generate(weeks = 4): Promise<number> {
  const { data: scheds } = await sb.from("schedules").select("id, trainer_id, type, weekday, hour, minute, schedule_members(member_id)").eq("active", true);
  const schedules = (scheds ?? []).map((s: any) => ({
    id: s.id, trainerId: s.trainer_id, type: s.type, weekday: s.weekday, hour: s.hour, minute: s.minute ?? 0,
    memberIds: (s.schedule_members ?? []).map((m: any) => m.member_id),
  })).filter((s: any) => s.memberIds.length > 0);
  if (!schedules.length) return 0;
  const byWeekday = new Map<number, any[]>();
  for (const s of schedules) { const a = byWeekday.get(s.weekday) ?? []; a.push(s); byWeekday.set(s.weekday, a); }
  const [Y, M, D] = todayISO().split("-").map(Number);
  const baseUtc = Date.UTC(Y, M - 1, D);
  const slots: any[] = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(baseUtc + i * 86400000);
    for (const s of byWeekday.get(d.getUTCDay()) ?? []) slots.push({ schedId: s.id, trainerId: s.trainerId, type: s.type, at: kstSlotInstant(d, s.hour, s.minute), memberIds: s.memberIds });
  }
  if (!slots.length) return 0;
  const { data: existing } = await sb.from("sessions").select("source_schedule_id, scheduled_at").in("source_schedule_id", schedules.map((s: any) => s.id)).gte("scheduled_at", new Date(baseUtc - 86400000).toISOString());
  const seen = new Set((existing ?? []).map((r: any) => `${r.source_schedule_id}|${new Date(r.scheduled_at).getTime()}`));
  const fresh = slots.filter((s) => !seen.has(`${s.schedId}|${s.at.getTime()}`));
  if (!fresh.length) return 0;
  const { data: inserted, error } = await sb.from("sessions").insert(fresh.map((s) => ({ trainer_id: s.trainerId, scheduled_at: s.at.toISOString(), type: s.type, status: "scheduled", source_schedule_id: s.schedId }))).select("id, source_schedule_id, scheduled_at");
  if (error) throw error;
  const rows: any[] = [];
  for (const r of inserted ?? []) {
    const slot = fresh.find((s) => s.schedId === r.source_schedule_id && s.at.getTime() === new Date(r.scheduled_at).getTime());
    if (slot) for (const mid of slot.memberIds) rows.push({ session_id: r.id, member_id: mid });
  }
  if (rows.length) await sb.from("session_members").insert(rows);
  return (inserted ?? []).length;
}

const weeks = Number(process.argv[2] ?? "4") || 4;
console.log("today (KST):", todayISO(), "| weeks:", weeks);
console.log("latest scheduled session BEFORE:", await latestScheduled());
console.log("expired flipped:", await flipExpired());
console.log("sessions generated:", await generate(weeks));
console.log("sessions generated (re-run, expect 0 = idempotent):", await generate(weeks));
console.log("latest scheduled session AFTER:", await latestScheduled());
