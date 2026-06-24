/**
 * Seed the (reset) Supabase project with season-pt_v2 design data + demo accounts.
 * Run AFTER reset + 0001 migration:  bun run scripts/seed-prod.ts
 * Uses service-role key from .env.local. Idempotent only on a fresh DB.
 */
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../src/lib/auth/password";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const DOMAIN = process.env.TRAINER_EMAIL_DOMAIN || "trainer.seasonpt.local";
if (!url || !serviceKey) throw new Error("missing supabase env");

const db = createClient(url, serviceKey, { auth: { persistSession: false } });
const OWNER_PW = "gyeaul1234";

async function createTrainerUser(username: string, password: string) {
  const email = `${username}@${DOMAIN}`;
  const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`auth user ${username}: ${error?.message}`);
  return data.user.id;
}

async function main() {
  // ---- trainers (Supabase Auth) ----
  const ownerUid = await createTrainerUser("gyeaul.master", OWNER_PW);
  const suminUid = await createTrainerUser("gyeaul.sumin", OWNER_PW);
  const jihunUid = await createTrainerUser("gyeaul.jihun", OWNER_PW);
  const haneulUid = await createTrainerUser("gyeaul.haneul", "ptss-7390");

  const trainers = [
    { auth_user_id: ownerUid, username: "gyeaul.master", display_name: "김계절", role: "owner", status: "active", must_change_password: false },
    { auth_user_id: suminUid, username: "gyeaul.sumin", display_name: "이수민", role: "instructor", status: "active", must_change_password: false },
    { auth_user_id: jihunUid, username: "gyeaul.jihun", display_name: "박지훈", role: "instructor", status: "active", must_change_password: false },
    { auth_user_id: haneulUid, username: "gyeaul.haneul", display_name: "정하늘", role: "instructor", status: "invited", must_change_password: true },
  ];
  const { data: tRows, error: tErr } = await db.from("trainers").insert(trainers).select("id, username");
  if (tErr) throw tErr;
  const ownerId = tRows!.find((t) => t.username === "gyeaul.master")!.id;

  // ---- members (custom auth) ----
  const memberDefs = [
    { key: "jung", name: "정민호", phone: "01030010001", birth: "1988-07-15", gender: "male", tone: "sageMid", status: "active", remaining: 1, dDay: 3 },
    { key: "park", name: "박서연", phone: "01030020002", birth: "1992-11-03", gender: "female", tone: "sage", status: "active", remaining: 2, dDay: 5 },
    { key: "iji", name: "이지수", phone: "01023456789", birth: "1995-04-12", gender: "female", tone: "gold", status: "active", remaining: 3, dDay: 9, injury: "오른쪽 어깨 회전근 주의 — 오버헤드 동작 시 무게 보수적으로." },
    { key: "han", name: "한지우", phone: "01030040004", birth: "1990-02-20", gender: "male", tone: "sage", status: "active", remaining: 12, dDay: 48 },
    { key: "yoon", name: "윤지아", phone: "01030050005", birth: "1996-09-09", gender: "female", tone: "sage", status: "active", remaining: 8, dDay: 40 },
    { key: "kang", name: "강민", phone: "01030060006", birth: "1993-05-25", gender: "male", tone: "gold", status: "active", remaining: 8, dDay: 40 },
  ];
  const memberRows = memberDefs.map((m) => ({
    name: m.name,
    phone: m.phone,
    birthdate: m.birth,
    password_hash: hashPassword(m.birth.slice(2).replace(/-/g, "")), // YYMMDD
    gender: m.gender,
    status: m.status,
    injury_note: m.injury ?? null,
    avatar_tone: m.tone,
  }));
  const { data: mRows, error: mErr } = await db.from("members").insert(memberRows).select("id, name, phone");
  if (mErr) throw mErr;
  const idByKey: Record<string, string> = {};
  for (const def of memberDefs) idByKey[def.key] = mRows!.find((r) => r.phone === def.phone)!.id;

  // member -> owner trainer
  await db.from("member_trainers").insert(memberDefs.map((m) => ({ member_id: idByKey[m.key], trainer_id: ownerId })));

  // memberships (end_date = today + dDay)
  const today = new Date("2026-06-22T00:00:00+09:00");
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000).toISOString().slice(0, 10);
  const product = (m: { remaining: number; dDay: number }, type2on1 = false) => ({
    product: "20",
    total_sessions: 20,
    remaining_sessions: m.remaining,
    start_date: addDays(today, m.dDay - 90),
    end_date: addDays(today, m.dDay),
    price: type2on1 ? null : 1400000,
    status: "active",
    guided: false,
  });
  const memberships = memberDefs.map((m) => ({ member_id: idByKey[m.key], ...product(m, m.key === "yoon" || m.key === "kang") }));
  // 박서연 already guided
  memberships[1].guided = true;
  await db.from("memberships").insert(memberships);

  // ---- schedules (weekday: 0=Sun..6=Sat real calendar) + members ----
  const schedDefs = [
    { type: "1on1", weekday: 2, hour: 18, members: ["jung"] }, // 화 18
    { type: "1on1", weekday: 4, hour: 18, members: ["jung"] }, // 목 18
    { type: "1on1", weekday: 1, hour: 19, members: ["park"] }, // 월 19
    { type: "1on1", weekday: 3, hour: 19, members: ["park"] }, // 수 19
    { type: "1on1", weekday: 3, hour: 19, members: ["iji"] },  // 수 19
    { type: "1on1", weekday: 6, hour: 19, members: ["iji"] },  // 토 19
    { type: "1on1", weekday: 1, hour: 20, members: ["han"] },  // 월 20
    { type: "1on1", weekday: 5, hour: 20, members: ["han"] },  // 금 20
    { type: "2on1", weekday: 2, hour: 20, members: ["yoon", "kang"] }, // 화 20
    { type: "2on1", weekday: 6, hour: 20, members: ["yoon", "kang"] }, // 토 20
  ];
  const sessionsToInsert: { trainer_id: string; scheduled_at: string; type: string; status: string; _members: string[] }[] = [];
  for (const s of schedDefs) {
    const { data: sched } = await db
      .from("schedules")
      .insert({ trainer_id: ownerId, type: s.type, weekday: s.weekday, hour: s.hour })
      .select("id")
      .single();
    await db.from("schedule_members").insert(s.members.map((k) => ({ schedule_id: sched!.id, member_id: idByKey[k] })));
    // generate June 2026 sessions on real matching weekdays
    for (let day = 1; day <= 30; day++) {
      const d = new Date(Date.UTC(2026, 5, day, s.hour - 9, 0, 0)); // KST hour -> UTC
      if (new Date(2026, 5, day).getDay() !== s.weekday) continue;
      const isPast = day < 22;
      sessionsToInsert.push({
        trainer_id: ownerId,
        scheduled_at: d.toISOString(),
        type: s.type,
        status: isPast ? "attended" : "scheduled",
        _members: s.members.map((k) => idByKey[k]),
      });
    }
  }
  for (const s of sessionsToInsert) {
    const { _members, ...row } = s;
    const { data: sess } = await db.from("sessions").insert(row).select("id").single();
    await db.from("session_members").insert(_members.map((mid) => ({ session_id: sess!.id, member_id: mid })));
  }

  // body composition for 이지수
  await db.from("body_compositions").insert({ member_id: idByKey.iji, weight: 58.2, skeletal_muscle: 32.0, body_fat: 22.1 });

  // ---- change requests (received, from members) ----
  const upcoming = async (memberId: string) => {
    const { data } = await db
      .from("sessions")
      .select("id, scheduled_at, session_members!inner(member_id)")
      .eq("session_members.member_id", memberId)
      .gte("scheduled_at", today.toISOString())
      .order("scheduled_at")
      .limit(1);
    return data?.[0];
  };
  for (const [key, type, reason] of [
    ["park", "change", null],
    ["jung", "cancel", "출장 일정"],
    ["iji", "change", null],
  ] as const) {
    const s = await upcoming(idByKey[key]);
    if (!s) continue;
    await db.from("schedule_change_requests").insert({
      session_id: s.id,
      requester_type: "member",
      requester_id: idByKey[key],
      type,
      status: "pending",
      reason,
      original_at: s.scheduled_at,
      proposed_slots: type === "change" ? [addDays(today, 1) + "T10:00:00Z", addDays(today, 2) + "T11:00:00Z"] : [],
    });
  }

  // ---- chat: 이지수 (1on1) + team (2on1) ----
  const { data: th1 } = await db
    .from("chat_threads")
    .insert({ trainer_id: ownerId, type: "1on1", last_message: "네 알겠습니다! 토요일에 봬요", last_at: new Date().toISOString() })
    .select("id")
    .single();
  await db.from("chat_participants").insert({ thread_id: th1!.id, member_id: idByKey.iji });
  await db.from("chat_messages").insert([
    { thread_id: th1!.id, sender_type: "trainer", sender_id: ownerId, text: "오늘 수업 고생하셨어요! 다음 시간엔 하체 위주로 가볼게요.", read_by_member: true, read_by_trainer: true },
    { thread_id: th1!.id, sender_type: "member", sender_id: idByKey.iji, text: "넵 감사합니다 선생님", read_by_trainer: true },
    { thread_id: th1!.id, sender_type: "member", sender_id: idByKey.iji, text: "네 알겠습니다! 토요일에 봬요" },
  ]);

  const { data: th2 } = await db
    .from("chat_threads")
    .insert({ trainer_id: ownerId, type: "2on1", last_message: "윤지아: 다음 주 시간 조정 가능할까요?", last_at: new Date().toISOString() })
    .select("id")
    .single();
  await db.from("chat_participants").insert([
    { thread_id: th2!.id, member_id: idByKey.yoon },
    { thread_id: th2!.id, member_id: idByKey.kang },
  ]);
  await db.from("chat_messages").insert([
    { thread_id: th2!.id, sender_type: "member", sender_id: idByKey.yoon, text: "선생님 다음 주 시간 조정 가능할까요?" },
    { thread_id: th2!.id, sender_type: "member", sender_id: idByKey.kang, text: "저도 화요일은 괜찮습니다" },
  ]);

  console.log("seed complete:", {
    trainers: trainers.length,
    members: memberDefs.length,
    sessions: sessionsToInsert.length,
  });
}

main().catch((e) => {
  console.error("SEED FAILED:", e);
  process.exit(1);
});
