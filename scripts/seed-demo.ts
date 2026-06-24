/**
 * Demo seed for the test.owner (정호진) studio — rich, realistic data for a live demo.
 *
 * Idempotent: re-running deletes the demo members (by phone) + the schedules/sessions/chats
 * owned by 정호진/이수민/박지훈, then rebuilds. It does NOT touch the legacy gyeaul.master
 * roster (that owner is converted to a senior instructor so 정호진 is the sole 대표).
 *
 * Run:  bun run scripts/seed-demo.ts
 */
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "../src/lib/auth/password";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !serviceKey) throw new Error("missing supabase env");
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

const TODAY = "2026-06-24"; // KST anchor (currentDate)
const DAY = 86400000;
const addDays = (iso: string, n: number) =>
  new Date(new Date(iso + "T00:00:00Z").getTime() + n * DAY).toISOString().slice(0, 10);
/** timestamptz for a KST wall-clock (dateISO @ hour). hour-9 → UTC; Date.UTC normalizes negatives. */
const at = (dateISO: string, hour: number) => {
  const [y, m, d] = dateISO.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hour - 9, 0, 0)).toISOString();
};
const nowISO = () => new Date().toISOString();

type Sched = { weekday: number; hour: number; type: "1on1" | "2on1" };

type MemberDef = {
  key: string;
  trainer: "owner" | "sumin" | "jihun";
  name: string;
  phone: string;
  birth: string; // YYYY-MM-DD
  gender: "male" | "female";
  tone: string;
  status: "active" | "rest" | "inactive";
  injury?: string;
  joined: string; // created_at date
  sessionsSince: string;
  scheds: Sched[];
  partnerKey?: string; // for 2on1 shared schedule (only the "lead" lists the sched)
  // active membership
  product: "10" | "20" | "30";
  remaining: number;
  msStart: string;
  msEnd: string;
  price: number | null;
  guided?: boolean;
  // payment for the active membership (date); null → no payment (e.g. 2:1)
  payAt?: string;
  payMethod?: "card" | "cash" | "account";
  // extra historical memberships+payments (for the star member)
  history?: { product: "10" | "20" | "30"; start: string; end: string; price: number; payAt: string }[];
  body?: { weight: number; sm: number; bf: number; at: string }[];
};

const PRICE = { "10": 750000, "20": 1400000, "30": 1980000 } as const;

const MEMBERS: MemberDef[] = [
  // ── 정호진(대표) 담당 ─────────────────────────────────────────────
  {
    key: "doyoon", trainer: "owner", name: "김도윤", phone: "01044010001", birth: "1990-03-14",
    gender: "male", tone: "sageMid", status: "active", joined: "2026-06-06", sessionsSince: "2026-06-06",
    scheds: [{ weekday: 2, hour: 7, type: "1on1" }, { weekday: 4, hour: 7, type: "1on1" }],
    product: "30", remaining: 24, msStart: "2026-06-06", msEnd: addDays(TODAY, 72), price: PRICE["30"],
    payAt: "2026-06-06", payMethod: "card",
    body: [{ weight: 78.5, sm: 38.0, bf: 18.0, at: "2026-06-08" }],
  },
  {
    key: "seoa", trainer: "owner", name: "이서아", phone: "01044010002", birth: "1994-08-22",
    gender: "female", tone: "sage", status: "active", joined: "2026-03-29", sessionsSince: "2026-05-01",
    scheds: [{ weekday: 1, hour: 19, type: "1on1" }, { weekday: 3, hour: 19, type: "1on1" }],
    product: "20", remaining: 2, msStart: addDays(TODAY, 3 - 90), msEnd: addDays(TODAY, 3), price: PRICE["20"],
    guided: false, payAt: "2026-03-29", payMethod: "card",
    body: [{ weight: 60.1, sm: 24.0, bf: 27.5, at: "2026-04-02" }],
  },
  {
    key: "jiyoon", trainer: "owner", name: "박지윤", phone: "01044010003", birth: "1997-12-05",
    gender: "female", tone: "gold", status: "active", joined: "2026-03-22", sessionsSince: "2026-05-01",
    scheds: [{ weekday: 5, hour: 20, type: "1on1" }],
    product: "20", remaining: 5, msStart: addDays(TODAY, 9 - 90), msEnd: addDays(TODAY, 9), price: PRICE["20"],
    guided: true, payAt: "2026-04-04", payMethod: "card",
  },
  {
    key: "minjun", trainer: "owner", name: "최민준", phone: "01044010004", birth: "1988-06-30",
    gender: "male", tone: "sage", status: "active", joined: "2026-06-12", sessionsSince: "2026-06-12",
    scheds: [{ weekday: 6, hour: 10, type: "1on1" }],
    product: "10", remaining: 8, msStart: "2026-06-12", msEnd: addDays(TODAY, 44), price: PRICE["10"],
    payAt: "2026-06-12", payMethod: "card",
  },
  {
    key: "chaewon", trainer: "owner", name: "윤채원", phone: "01044010005", birth: "1992-02-17",
    gender: "female", tone: "sageSoft", status: "active", joined: "2025-05-08", sessionsSince: "2026-05-01",
    injury: "왼쪽 무릎 십자인대 수술 이력 — 점프·런지 시 가동범위 체크.",
    scheds: [{ weekday: 3, hour: 18, type: "1on1" }, { weekday: 5, hour: 18, type: "1on1" }],
    product: "20", remaining: 12, msStart: "2026-05-25", msEnd: addDays("2026-05-25", 90), price: PRICE["20"],
    payAt: "2026-05-25", payMethod: "card",
    history: [
      { product: "20", start: "2025-05-08", end: "2025-08-06", price: PRICE["20"], payAt: "2025-05-08" },
      { product: "20", start: "2025-11-10", end: "2026-02-08", price: PRICE["20"], payAt: "2025-11-10" },
    ],
    body: [
      { weight: 62.0, sm: 24.5, bf: 28.0, at: "2025-05-10" },
      { weight: 58.5, sm: 26.0, bf: 24.0, at: "2026-01-15" },
      { weight: 56.2, sm: 27.1, bf: 21.5, at: "2026-06-10" },
    ],
  },
  {
    key: "yujin", trainer: "owner", name: "정유진", phone: "01044010006", birth: "1992-09-09",
    gender: "female", tone: "pending", status: "rest", joined: "2025-12-02", sessionsSince: "2026-05-01",
    scheds: [{ weekday: 2, hour: 18, type: "1on1" }],
    product: "20", remaining: 11, msStart: "2026-04-15", msEnd: addDays(TODAY, 20), price: PRICE["20"],
    payAt: "2026-04-15", payMethod: "account",
    body: [{ weight: 54.0, sm: 22.5, bf: 26.0, at: "2026-04-20" }],
  },
  {
    key: "sohee", trainer: "owner", name: "한소희", phone: "01044010007", birth: "1996-05-11",
    gender: "female", tone: "sage", status: "active", joined: "2026-05-20", sessionsSince: "2026-05-20",
    scheds: [{ weekday: 2, hour: 20, type: "2on1" }, { weekday: 6, hour: 20, type: "2on1" }],
    partnerKey: "taehyun",
    product: "20", remaining: 9, msStart: "2026-05-20", msEnd: addDays("2026-05-20", 90), price: null,
  },
  {
    key: "taehyun", trainer: "owner", name: "강태현", phone: "01044010008", birth: "1995-09-28",
    gender: "male", tone: "sageMid", status: "active", joined: "2026-05-20", sessionsSince: "2026-05-20",
    scheds: [], // shares 한소희's 2on1 schedule
    product: "20", remaining: 9, msStart: "2026-05-20", msEnd: addDays("2026-05-20", 90), price: null,
  },
  // ── 이수민(강사) 담당 ─────────────────────────────────────────────
  {
    key: "jiho", trainer: "sumin", name: "오지호", phone: "01044020001", birth: "1991-01-19",
    gender: "male", tone: "sage", status: "active", joined: "2026-06-15", sessionsSince: "2026-06-15",
    scheds: [{ weekday: 1, hour: 19, type: "1on1" }, { weekday: 4, hour: 19, type: "1on1" }],
    product: "20", remaining: 15, msStart: "2026-06-15", msEnd: addDays(TODAY, 81), price: PRICE["20"],
    payAt: "2026-06-15", payMethod: "card",
  },
  {
    key: "areum", trainer: "sumin", name: "신아름", phone: "01044020002", birth: "1993-07-07",
    gender: "female", tone: "gold", status: "active", joined: "2026-02-10", sessionsSince: "2026-05-01",
    scheds: [{ weekday: 2, hour: 10, type: "1on1" }, { weekday: 5, hour: 10, type: "1on1" }],
    product: "20", remaining: 9, msStart: "2026-04-10", msEnd: addDays(TODAY, 15), price: PRICE["20"],
    payAt: "2026-04-10", payMethod: "card",
  },
  {
    key: "junyoung", trainer: "sumin", name: "서준영", phone: "01044020003", birth: "1989-11-23",
    gender: "male", tone: "sageMid", status: "active", joined: "2026-03-20", sessionsSince: "2026-05-01",
    scheds: [{ weekday: 3, hour: 20, type: "1on1" }],
    product: "10", remaining: 3, msStart: addDays(TODAY, 6 - 90), msEnd: addDays(TODAY, 6), price: PRICE["10"],
    guided: false, payAt: "2026-04-01", payMethod: "cash",
  },
  // ── 박지훈(강사) 담당 ─────────────────────────────────────────────
  {
    key: "haerin", trainer: "jihun", name: "문해린", phone: "01044030001", birth: "1998-04-02",
    gender: "female", tone: "sageSoft", status: "active", joined: "2026-05-20", sessionsSince: "2026-05-20",
    scheds: [{ weekday: 1, hour: 11, type: "1on1" }, { weekday: 3, hour: 11, type: "1on1" }],
    product: "20", remaining: 13, msStart: "2026-05-20", msEnd: addDays("2026-05-20", 90), price: PRICE["20"],
    payAt: "2026-05-20", payMethod: "card",
  },
  {
    key: "hyunwoo", trainer: "jihun", name: "배현우", phone: "01044030002", birth: "1987-10-15",
    gender: "male", tone: "sage", status: "active", joined: "2026-04-07", sessionsSince: "2026-05-01",
    scheds: [{ weekday: 6, hour: 9, type: "1on1" }],
    product: "20", remaining: 6, msStart: addDays(TODAY, 12 - 90), msEnd: addDays(TODAY, 12), price: PRICE["20"],
    guided: false, payAt: "2026-04-07", payMethod: "card",
  },
];

const WORKOUT_SETS: Record<string, { name: string; kg: number; sets: number }[]> = {
  chaewon: [
    { name: "데드리프트", kg: 50, sets: 5 },
    { name: "레그프레스", kg: 80, sets: 4 },
    { name: "랫풀다운", kg: 35, sets: 4 },
  ],
  doyoon: [
    { name: "벤치프레스", kg: 70, sets: 5 },
    { name: "바벨로우", kg: 60, sets: 4 },
    { name: "스쿼트", kg: 90, sets: 5 },
  ],
  yujin: [
    { name: "고블릿스쿼트", kg: 16, sets: 4 },
    { name: "힙쓰러스트", kg: 40, sets: 4 },
  ],
  seoa: [
    { name: "런지", kg: 12, sets: 3 },
    { name: "케이블플라이", kg: 10, sets: 4 },
  ],
};
const WORKOUT_COMMENT: Record<string, string> = {
  chaewon: "데드리프트 폼 많이 안정됐어요. 다음 주 5kg 증량 예정.",
  doyoon: "상체 컨디션 좋음. 스쿼트 깊이 신경쓰기.",
  yujin: "복귀 후 첫 주 — 무릎 무리 없이 잘 마무리.",
  seoa: "마무리 스트레칭 꼼꼼히. 다음 시간 하체 위주.",
};

async function main() {
  // ── resolve trainers ──────────────────────────────────────────────
  const { data: tr } = await db.from("trainers").select("id, username");
  const tid = (u: string) => {
    const r = (tr ?? []).find((t) => t.username === u);
    if (!r) throw new Error(`trainer not found: ${u}`);
    return r.id as string;
  };
  const T = {
    owner: tid("test.owner"),
    sumin: tid("gyeaul.sumin"),
    jihun: tid("gyeaul.jihun"),
    master: tid("gyeaul.master"),
  };
  const demoTrainerIds = [T.owner, T.sumin, T.jihun];

  // ── cleanup (idempotent) ──────────────────────────────────────────
  const demoPhones = [...MEMBERS.map((m) => m.phone), "01099999999"]; // + junk 테스트회원
  await db.from("members").delete().in("phone", demoPhones);
  await db.from("sessions").delete().in("trainer_id", demoTrainerIds);
  await db.from("schedules").delete().in("trainer_id", demoTrainerIds);
  await db.from("chat_threads").delete().in("trainer_id", demoTrainerIds);
  console.log("cleanup done");

  // ── roster: 정호진 대표, 김계절→senior 강사 (single owner) ──────────
  await db.from("trainers").update({ display_name: "정호진" }).eq("id", T.owner);
  await db.from("trainers").update({ role: "instructor" }).eq("id", T.master);
  console.log("roster updated: test.owner→정호진, gyeaul.master→instructor");

  // backdate legacy (gyeaul.master) members' join dates so "이번 달 신규" isn't inflated
  const legacyJoin: Record<string, string> = {
    "01030010001": "2026-01-12", "01030020002": "2026-02-03", "01023456789": "2026-02-20",
    "01030040004": "2026-03-15", "01030050005": "2026-04-08", "01030060006": "2026-04-08",
  };
  for (const [phone, joined] of Object.entries(legacyJoin)) {
    await db.from("members").update({ created_at: at(joined, 12) }).eq("phone", phone);
  }

  // ── members + links + memberships + payments + body ───────────────
  const memberRows = MEMBERS.map((m) => ({
    name: m.name, phone: m.phone, birthdate: m.birth,
    password_hash: hashPassword(m.birth.slice(2).replace(/-/g, "")), // YYMMDD
    gender: m.gender, status: m.status, injury_note: m.injury ?? null,
    avatar_tone: m.tone, created_at: at(m.joined, 12),
  }));
  const { data: inserted, error: mErr } = await db.from("members").insert(memberRows).select("id, phone");
  if (mErr) throw mErr;
  const idByKey: Record<string, string> = {};
  for (const m of MEMBERS) idByKey[m.key] = inserted!.find((r) => r.phone === m.phone)!.id;

  await db.from("member_trainers").insert(MEMBERS.map((m) => ({ member_id: idByKey[m.key], trainer_id: T[m.trainer] })));

  // memberships (active + history), keep id of active for chat/requests; collect payments
  const payments: { membership_id: string; method: string; amount: number; paid_at: string }[] = [];
  const activeMsId: Record<string, string> = {};
  for (const m of MEMBERS) {
    const { data: ms } = await db.from("memberships").insert({
      member_id: idByKey[m.key], product: m.product, total_sessions: Number(m.product),
      remaining_sessions: m.remaining, start_date: m.msStart, end_date: m.msEnd,
      price: m.price, status: "active", guided: !!m.guided,
    }).select("id").single();
    activeMsId[m.key] = ms!.id;
    if (m.payAt && m.price) payments.push({ membership_id: ms!.id, method: m.payMethod ?? "card", amount: m.price, paid_at: m.payAt });
    for (const h of m.history ?? []) {
      const { data: hm } = await db.from("memberships").insert({
        member_id: idByKey[m.key], product: h.product, total_sessions: Number(h.product),
        remaining_sessions: 0, start_date: h.start, end_date: h.end, price: h.price,
        status: "expired", guided: true,
      }).select("id").single();
      payments.push({ membership_id: hm!.id, method: "card", amount: h.price, paid_at: h.payAt });
    }
  }
  await db.from("payments").insert(payments);
  console.log(`members: ${MEMBERS.length}, payments: ${payments.length}`);

  // body compositions
  const bodyRows = MEMBERS.flatMap((m) =>
    (m.body ?? []).map((b) => ({
      member_id: idByKey[m.key], weight: b.weight, skeletal_muscle: b.sm, body_fat: b.bf, measured_at: at(b.at, 9),
    }))
  );
  if (bodyRows.length) await db.from("body_compositions").insert(bodyRows);

  // ── schedules + sessions ──────────────────────────────────────────
  let sessionCount = 0, attendedCount = 0, noshowCount = 0;
  const lastAttendedByKey: Record<string, string> = {}; // key → session_id (latest attended)
  const memberUpcoming: Record<string, { id: string; date: string; iso: string }> = {}; // key → next scheduled session
  const noshowFor = new Set(["yujin", "junyoung"]); // first past session → noshow

  for (const m of MEMBERS) {
    if (m.scheds.length === 0) continue;
    const trainerId = T[m.trainer];
    const partnerId = m.partnerKey ? idByKey[m.partnerKey] : null;
    const memberIds = partnerId ? [idByKey[m.key], partnerId] : [idByKey[m.key]];
    let firstPastFlipped = false;

    for (const s of m.scheds) {
      const { data: sched } = await db.from("schedules")
        .insert({ trainer_id: trainerId, type: s.type, weekday: s.weekday, hour: s.hour, active: true })
        .select("id").single();
      await db.from("schedule_members").insert(memberIds.map((mid) => ({ schedule_id: sched!.id, member_id: mid })));

      // generate sessions from sessionsSince..2026-06-30 on matching weekday
      let cur = m.sessionsSince;
      const end = "2026-06-30";
      while (cur <= end) {
        const [y, mo, d] = cur.split("-").map(Number);
        if (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() === s.weekday) {
          const isPast = cur < TODAY;
          let status: "attended" | "noshow" | "scheduled" = isPast ? "attended" : "scheduled";
          if (isPast && noshowFor.has(m.key) && !firstPastFlipped) { status = "noshow"; firstPastFlipped = true; }
          const { data: sess } = await db.from("sessions").insert({
            trainer_id: trainerId, scheduled_at: at(cur, s.hour), type: s.type, status,
            source_schedule_id: sched!.id,
          }).select("id").single();
          await db.from("session_members").insert(memberIds.map((mid) => ({ session_id: sess!.id, member_id: mid })));
          sessionCount++;
          if (status === "attended") { attendedCount++; lastAttendedByKey[m.key] = sess!.id; }
          if (status === "noshow") noshowCount++;
          if (status === "scheduled") {
            const prev = memberUpcoming[m.key];
            if (!prev || cur < prev.date) memberUpcoming[m.key] = { id: sess!.id, date: cur, iso: at(cur, s.hour) };
          }
        }
        cur = addDays(cur, 1);
      }
    }
  }
  console.log(`sessions: ${sessionCount} (attended ${attendedCount}, noshow ${noshowCount})`);

  // workout records + attendance ledger for latest attended of key members
  for (const key of Object.keys(WORKOUT_SETS)) {
    const sid = lastAttendedByKey[key];
    if (!sid) continue;
    await db.from("workout_records").insert({
      session_id: sid, member_id: idByKey[key], exercises: WORKOUT_SETS[key],
      comment: WORKOUT_COMMENT[key] ?? null, created_by: T.owner,
    });
    await db.from("attendance_ledger").insert({
      session_id: sid, member_id: idByKey[key], action: "attend", deducted: true,
      remaining_before: null, remaining_after: null, created_by: T.owner,
    });
  }

  // ── chats (정호진's threads) ───────────────────────────────────────
  // 1:1 윤채원
  {
    const { data: th } = await db.from("chat_threads").insert({
      trainer_id: T.owner, type: "1on1",
      last_message: "선생님 다음 주 수요일에 혹시 시간 당길 수 있을까요?", last_at: nowISO(), updated_at: nowISO(),
    }).select("id").single();
    await db.from("chat_participants").insert({ thread_id: th!.id, member_id: idByKey.chaewon });
    await db.from("chat_messages").insert([
      { thread_id: th!.id, sender_type: "trainer", sender_id: T.owner, text: "오늘 데드리프트 폼 한결 좋아지셨어요! 다음엔 5kg 올려볼게요.", read_by_trainer: true, read_by_member: true, created_at: at("2026-06-19", 20) },
      { thread_id: th!.id, sender_type: "member", sender_id: idByKey.chaewon, text: "넵 감사합니다 선생님 💪", read_by_trainer: true, read_by_member: true, created_at: at("2026-06-19", 21) },
      { thread_id: th!.id, sender_type: "member", sender_id: idByKey.chaewon, text: "선생님 다음 주 수요일에 혹시 시간 당길 수 있을까요?", read_by_trainer: false, read_by_member: true, created_at: at("2026-06-23", 12) },
    ]);
  }
  // 1:1 이서아 (재등록 상담 — retention narrative)
  {
    const { data: th } = await db.from("chat_threads").insert({
      trainer_id: T.owner, type: "1on1",
      last_message: "선생님 회원권 곧 끝나가는데 재등록 상담 가능할까요?", last_at: nowISO(), updated_at: nowISO(),
    }).select("id").single();
    await db.from("chat_participants").insert({ thread_id: th!.id, member_id: idByKey.seoa });
    await db.from("chat_messages").insert([
      { thread_id: th!.id, sender_type: "member", sender_id: idByKey.seoa, text: "선생님 회원권 곧 끝나가는데 재등록 상담 가능할까요?", read_by_trainer: false, read_by_member: true, created_at: at("2026-06-23", 18) },
    ]);
  }
  // 2:1 한소희·강태현
  {
    const { data: th } = await db.from("chat_threads").insert({
      trainer_id: T.owner, type: "2on1",
      last_message: "강태현: 저도 토요일 참석합니다!", last_at: nowISO(), updated_at: nowISO(),
    }).select("id").single();
    await db.from("chat_participants").insert([
      { thread_id: th!.id, member_id: idByKey.sohee },
      { thread_id: th!.id, member_id: idByKey.taehyun },
    ]);
    await db.from("chat_messages").insert([
      { thread_id: th!.id, sender_type: "trainer", sender_id: T.owner, text: "이번 주 토요일 8시 수업 그대로 진행할게요!", read_by_trainer: true, read_by_member: true, created_at: at("2026-06-22", 13) },
      { thread_id: th!.id, sender_type: "member", sender_id: idByKey.sohee, text: "넵 참석합니다~", read_by_trainer: true, read_by_member: true, created_at: at("2026-06-22", 14) },
      { thread_id: th!.id, sender_type: "member", sender_id: idByKey.taehyun, text: "저도 토요일 참석합니다!", read_by_trainer: false, read_by_member: true, created_at: at("2026-06-23", 9) },
    ]);
  }

  // ── change requests (member → pending, on 정호진's future sessions) ──
  const reqs: { key: string; type: "change" | "cancel"; reason: string | null; slots: string[] }[] = [
    { key: "seoa", type: "change", reason: "회사 회식 일정과 겹쳐요", slots: [at(addDays(TODAY, 2), 20), at(addDays(TODAY, 4), 19)] },
    { key: "doyoon", type: "cancel", reason: "지방 출장", slots: [] },
  ];
  let reqCount = 0;
  for (const r of reqs) {
    const up = memberUpcoming[r.key];
    if (!up) continue;
    await db.from("schedule_change_requests").insert({
      session_id: up.id, requester_type: "member", requester_id: idByKey[r.key],
      type: r.type, status: "pending", reason: r.reason, original_at: up.iso,
      proposed_slots: r.slots,
    });
    reqCount++;
  }
  console.log(`chats: 3 threads, change requests: ${reqCount}`);

  console.log("\n✅ demo seed complete");
}

main().catch((e) => {
  console.error("DEMO SEED FAILED:", e);
  process.exit(1);
});
