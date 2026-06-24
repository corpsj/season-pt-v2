/**
 * Create a 강사(instructor) TEST account + a small scoped roster so the instructor
 * experience (담당 회원만 보이는 캘린더/회원/채팅) demos cleanly next to the owner.
 *
 * Login: staff / test1234   (강사, active)
 * Idempotent: re-running resets this instructor's members (by phone) + schedules/sessions/threads.
 *
 * Run: bun run scripts/seed-instructor-test.ts
 */
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../src/lib/auth/password";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMAIN = process.env.TRAINER_EMAIL_DOMAIN || "trainer.seasonpt.local";
if (!url || !serviceKey) throw new Error("missing supabase env");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const TODAY = "2026-06-24";
const DAY = 86400000;
const addDays = (iso: string, n: number) =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);
const at = (dateISO: string, hour: number) => {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, 0, 0)).toISOString();
};
const nowISO = () => new Date().toISOString();

const USERNAME = "staff";
const EMAIL = `${USERNAME}@${DOMAIN}`;
const PASSWORD = "test1234";
const DISPLAY = "한지민";

type Sched = { weekday: number; hour: number };
type M = {
  key: string; name: string; phone: string; birth: string; gender: "male" | "female";
  tone: string; joined: string; since: string; scheds: Sched[];
  product: "10" | "20" | "30"; remaining: number; msStart: string; msEnd: string;
  price: number; payAt: string; payMethod: "card" | "cash" | "account";
  body?: { weight: number; sm: number; bf: number; at: string };
};
const PRICE = { "10": 750000, "20": 1400000, "30": 1980000 } as const;

const MEMBERS: M[] = [
  {
    key: "subin", name: "임수빈", phone: "01044050001", birth: "1995-03-10", gender: "female",
    tone: "sage", joined: "2026-03-28", since: "2026-05-01",
    scheds: [{ weekday: 1, hour: 19 }, { weekday: 4, hour: 19 }],
    product: "20", remaining: 10, msStart: addDays(TODAY, 7 - 90), msEnd: addDays(TODAY, 7),
    price: PRICE["20"], payAt: addDays(TODAY, 7 - 90), payMethod: "card",
    body: { weight: 57.4, sm: 24.8, bf: 26.0, at: "2026-05-02" },
  },
  {
    key: "hyunwoo", name: "조현우", phone: "01044050002", birth: "1990-08-21", gender: "male",
    tone: "sageMid", joined: "2026-06-10", since: "2026-06-10",
    scheds: [{ weekday: 2, hour: 7 }, { weekday: 5, hour: 7 }],
    product: "20", remaining: 14, msStart: "2026-06-10", msEnd: addDays(TODAY, 50),
    price: PRICE["20"], payAt: "2026-06-10", payMethod: "card",
  },
  {
    key: "jieun", name: "백지은", phone: "01044050003", birth: "1998-01-05", gender: "female",
    tone: "gold", joined: "2026-04-15", since: "2026-05-01",
    scheds: [{ weekday: 3, hour: 20 }],
    product: "10", remaining: 4, msStart: "2026-04-15", msEnd: addDays(TODAY, 25),
    price: PRICE["10"], payAt: "2026-04-15", payMethod: "cash",
  },
];

async function ensureAuthUser(): Promise<string> {
  // find existing by email (paginate a little), else create
  for (let page = 1; page <= 5; page++) {
    const { data } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    const u = data?.users?.find((x) => x.email === EMAIL);
    if (u) {
      await db.auth.admin.updateUserById(u.id, { password: PASSWORD });
      return u.id;
    }
    if (!data || data.users.length < 1000) break;
  }
  const { data: created, error } = await db.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
  if (error || !created.user) throw new Error("auth create failed: " + error?.message);
  return created.user.id;
}

async function main() {
  const authId = await ensureAuthUser();

  // upsert trainer row (instructor, active)
  const existing = (await db.from("trainers").select("id").eq("username", USERNAME).maybeSingle()).data;
  let trainerId: string;
  if (existing) {
    trainerId = existing.id;
    await db.from("trainers").update({
      auth_user_id: authId, display_name: DISPLAY, role: "instructor", status: "active", must_change_password: false,
    }).eq("id", trainerId);
  } else {
    const { data, error } = await db.from("trainers").insert({
      auth_user_id: authId, username: USERNAME, display_name: DISPLAY,
      role: "instructor", status: "active", must_change_password: false,
    }).select("id").single();
    if (error) throw error;
    trainerId = data!.id;
  }
  console.log("instructor:", USERNAME, "(" + DISPLAY + ") id=", trainerId);

  // idempotent cleanup
  await db.from("members").delete().in("phone", MEMBERS.map((m) => m.phone));
  await db.from("sessions").delete().eq("trainer_id", trainerId);
  await db.from("schedules").delete().eq("trainer_id", trainerId);
  await db.from("chat_threads").delete().eq("trainer_id", trainerId);

  // members + links + memberships + payments + body
  const rows = MEMBERS.map((m) => ({
    name: m.name, phone: m.phone, birthdate: m.birth,
    password_hash: hashPassword(m.birth.slice(2).replace(/-/g, "")),
    gender: m.gender, status: "active", avatar_tone: m.tone, created_at: at(m.joined, 12),
  }));
  const ins = (await db.from("members").insert(rows).select("id, phone")).data!;
  const id: Record<string, string> = {};
  for (const m of MEMBERS) id[m.key] = ins.find((r) => r.phone === m.phone)!.id;
  await db.from("member_trainers").insert(MEMBERS.map((m) => ({ member_id: id[m.key], trainer_id: trainerId })));

  const payments: any[] = [];
  for (const m of MEMBERS) {
    const ms = (await db.from("memberships").insert({
      member_id: id[m.key], product: m.product, total_sessions: Number(m.product),
      remaining_sessions: m.remaining, start_date: m.msStart, end_date: m.msEnd,
      price: m.price, status: "active", guided: false,
    }).select("id").single()).data!;
    payments.push({ membership_id: ms.id, method: m.payMethod, amount: m.price, paid_at: m.payAt });
    if (m.body) await db.from("body_compositions").insert({ member_id: id[m.key], weight: m.body.weight, skeletal_muscle: m.body.sm, body_fat: m.body.bf, measured_at: at(m.body.at, 9) });
  }
  await db.from("payments").insert(payments);

  // schedules + sessions
  let sessCount = 0;
  const upcoming: Record<string, { id: string; iso: string; date: string }> = {};
  for (const m of MEMBERS) {
    for (const s of m.scheds) {
      const sched = (await db.from("schedules").insert({ trainer_id: trainerId, type: "1on1", weekday: s.weekday, hour: s.hour, active: true }).select("id").single()).data!;
      await db.from("schedule_members").insert({ schedule_id: sched.id, member_id: id[m.key] });
      let cur = m.since;
      while (cur <= "2026-06-30") {
        const [y, mo, d] = cur.split("-").map(Number);
        if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === s.weekday) {
          const status = cur < TODAY ? "attended" : "scheduled";
          const sess = (await db.from("sessions").insert({ trainer_id: trainerId, scheduled_at: at(cur, s.hour), type: "1on1", status, source_schedule_id: sched.id }).select("id").single()).data!;
          await db.from("session_members").insert({ session_id: sess.id, member_id: id[m.key] });
          sessCount++;
          if (status === "scheduled" && (!upcoming[m.key] || cur < upcoming[m.key].date)) upcoming[m.key] = { id: sess.id, iso: at(cur, s.hour), date: cur };
        }
        cur = addDays(cur, 1);
      }
    }
  }

  // chat: 임수빈 1:1, member-sent unread
  const th = (await db.from("chat_threads").insert({ trainer_id: trainerId, type: "1on1", last_message: "선생님 다음 주 월요일 수업 시간 조금 늦출 수 있을까요?", last_at: nowISO(), updated_at: nowISO() }).select("id").single()).data!;
  await db.from("chat_participants").insert({ thread_id: th.id, member_id: id.subin });
  await db.from("chat_messages").insert([
    { thread_id: th.id, sender_type: "trainer", sender_id: trainerId, text: "오늘 수업 잘하셨어요! 다음 시간엔 코어 위주로 갈게요.", read_by_trainer: true, read_by_member: true, created_at: at("2026-06-22", 20) },
    { thread_id: th.id, sender_type: "member", sender_id: id.subin, text: "선생님 다음 주 월요일 수업 시간 조금 늦출 수 있을까요?", read_by_trainer: false, read_by_member: true, created_at: at("2026-06-23", 11) },
  ]);

  // member -> instructor pending change request (instructor inbox)
  let reqCount = 0;
  const up = upcoming.hyunwoo;
  if (up) {
    await db.from("schedule_change_requests").insert({
      session_id: up.id, requester_type: "member", requester_id: id.hyunwoo,
      type: "change", status: "pending", reason: "회사 일정이 바뀌었어요",
      original_at: up.iso, proposed_slots: [at(addDays(TODAY, 2), 8), at(addDays(TODAY, 3), 7)],
    });
    reqCount++;
  }

  console.log(`members ${MEMBERS.length}, payments ${payments.length}, sessions ${sessCount}, chats 1, requests ${reqCount}`);
  console.log("✅ instructor test account ready — login:", USERNAME, "/", PASSWORD);
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
