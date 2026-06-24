/**
 * Add a TEST member account assigned to 정호진(owner).
 *   박성주 / 010-9783-0027 / pw 990325 (생년월일 1999-03-25)
 * Idempotent: re-running removes this member's sessions/schedules/threads + the member, then rebuilds.
 *
 * Run: bun run scripts/seed-member-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../src/lib/auth/password";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !service) throw new Error("missing supabase env");
const db = createClient(url, service, { auth: { persistSession: false } });

const TODAY = "2026-06-24";
const addDays = (iso: string, n: number) =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
const at = (d: string, h: number, min = 0) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd, h - 9, min, 0)).toISOString();
};

const PHONE = "01097830027";
const NAME = "박성주";
const BIRTH = "1999-03-25"; // pw 990325 (YYMMDD)
const SCHEDS = [{ weekday: 1, hour: 21, minute: 30 }, { weekday: 3, hour: 21, minute: 0 }]; // 월 9:30 · 수 9:00
const SINCE = "2026-05-15";

async function main() {
  const owner = (await db.from("trainers").select("id, display_name").eq("username", "owner").maybeSingle()).data;
  if (!owner) throw new Error("owner trainer not found");

  // --- idempotent cleanup (this member only) ---
  const existing = (await db.from("members").select("id").eq("phone", PHONE).maybeSingle()).data;
  if (existing) {
    const mid = existing.id;
    const tIds = ((await db.from("chat_participants").select("thread_id").eq("member_id", mid)).data ?? []).map((r) => r.thread_id);
    if (tIds.length) await db.from("chat_threads").delete().in("id", tIds);
    const sIds = ((await db.from("session_members").select("session_id").eq("member_id", mid)).data ?? []).map((r) => r.session_id);
    if (sIds.length) await db.from("sessions").delete().in("id", sIds);
    const schIds = ((await db.from("schedule_members").select("schedule_id").eq("member_id", mid)).data ?? []).map((r) => r.schedule_id);
    if (schIds.length) await db.from("schedules").delete().in("id", schIds);
    await db.from("members").delete().eq("id", mid);
    console.log("cleaned previous", NAME);
  }

  // --- member + link + membership + payment ---
  const m = (await db.from("members").insert({
    name: NAME, phone: PHONE, birthdate: BIRTH,
    password_hash: hashPassword(BIRTH.slice(2).replace(/-/g, "")), // 990325
    gender: "male", status: "active", avatar_tone: "sage", created_at: at(SINCE, 12),
  }).select("id").single()).data!;
  await db.from("member_trainers").insert({ member_id: m.id, trainer_id: owner.id });

  const ms = (await db.from("memberships").insert({
    member_id: m.id, product: "20", total_sessions: 20, remaining_sessions: 12,
    start_date: SINCE, end_date: addDays(SINCE, 90), price: 1400000, status: "active", guided: false,
  }).select("id").single()).data!;
  await db.from("payments").insert({ membership_id: ms.id, method: "card", amount: 1400000, paid_at: SINCE });
  await db.from("body_compositions").insert({ member_id: m.id, weight: 72.0, skeletal_muscle: 34.5, body_fat: 17.0, measured_at: at("2026-05-16", 9) });

  // --- schedules + sessions ---
  let sess = 0;
  for (const s of SCHEDS) {
    const sch = (await db.from("schedules").insert({ trainer_id: owner.id, type: "1on1", weekday: s.weekday, hour: s.hour, active: true }).select("id").single()).data!;
    await db.from("schedule_members").insert({ schedule_id: sch.id, member_id: m.id });
    let cur = SINCE;
    while (cur <= "2026-06-30") {
      const [y, mo, d] = cur.split("-").map(Number);
      if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === s.weekday) {
        const status = cur < TODAY ? "attended" : "scheduled";
        const ss = (await db.from("sessions").insert({ trainer_id: owner.id, scheduled_at: at(cur, s.hour, s.minute), type: "1on1", status, source_schedule_id: sch.id }).select("id").single()).data!;
        await db.from("session_members").insert({ session_id: ss.id, member_id: m.id });
        sess++;
      }
      cur = addDays(cur, 1);
    }
  }

  console.log(`✅ ${NAME} 추가 — 담당 ${owner.display_name}, 회원권 20회권(잔여 12), 세션 ${sess}`);
  console.log(`   로그인: ${PHONE} / 990325`);
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
