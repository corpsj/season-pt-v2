import "server-only";
import {
  sb,
  getTrainerContext,
  kstWeekday,
  todayISO,
  dayDiff,
  nowKstParts,
} from "@/lib/data/db";
import type { AvatarTone, PerfBar, PerfSummary, RetentionView } from "@/lib/types";


/** "YYYY년 M월" for the current KST month. */
function currentMonthLabel(): string {
  const now = nowKstParts();
  return `${now.getUTCFullYear()}년 ${now.getUTCMonth() + 1}월`;
}

/** First/last instant (UTC ISO) covering the current KST month. */
function monthBoundsKst(): { startISO: string; endISO: string } {
  const now = nowKstParts();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
  // KST midnight of the 1st, expressed as a real UTC instant.
  const start = new Date(Date.UTC(y, m, 1) - KST_OFFSET_MS);
  const end = new Date(Date.UTC(y, m + 1, 1) - KST_OFFSET_MS);
  return { startISO: start.toISOString(), endISO: end.toISOString() };
}

function asTone(t: string | null | undefined): AvatarTone {
  const tones: AvatarTone[] = ["sage", "sageMid", "sageSoft", "gold", "pending", "terracotta"];
  return tones.includes(t as AvatarTone) ? (t as AvatarTone) : "sage";
}

/* ------------------------------ perf ------------------------------ */
export async function getPerf(): Promise<PerfSummary> {
  const t = await getTrainerContext();
  const monthLabel = currentMonthLabel();

  if (!t) {
    return {
      monthLabel,
      revenue: 0,
      revenueDelta: 0,
      classCount: 0,
      memberCount: 0,
      attendRate: 100,
      weeklyBars: buildWeeklyBars([]),
      expiringCount: 0,
      expectedRevenue: 0,
    };
  }

  const { startISO, endISO } = monthBoundsKst();

  // This trainer's sessions in the current month (any status — used for weekly bars + rates).
  const { data: monthSessions } = await sb
    .from("sessions")
    .select("scheduled_at, status")
    .eq("trainer_id", t.id)
    .gte("scheduled_at", startISO)
    .lt("scheduled_at", endISO);

  const sessions = monthSessions ?? [];
  const attended = sessions.filter((s) => s.status === "attended");
  const noshow = sessions.filter((s) => s.status === "noshow");

  const classCount = attended.length;
  const denom = attended.length + noshow.length;
  const attendRate = denom > 0 ? Math.round((attended.length / denom) * 100) : 100;

  // Distinct members handled by this trainer.
  const { data: links } = await sb
    .from("member_trainers")
    .select("member_id")
    .eq("trainer_id", t.id);
  const memberIds = Array.from(new Set((links ?? []).map((l) => l.member_id)));
  const memberCount = memberIds.length;

  // Revenue: sum of this month's payments for this trainer's members' memberships.
  let revenue = 0;
  if (memberIds.length > 0) {
    const { data: memberships } = await sb
      .from("memberships")
      .select("id, price, status")
      .in("member_id", memberIds);
    const all = memberships ?? [];
    const membershipIds = all.map((m) => m.id);
    if (membershipIds.length > 0) {
      const { startISO: ps, endISO: pe } = monthBoundsKst();
      const { data: payments } = await sb
        .from("payments")
        .select("amount, paid_at")
        .in("membership_id", membershipIds)
        .gte("paid_at", ps.slice(0, 10))
        .lt("paid_at", pe.slice(0, 10));
      const paid = (payments ?? []).reduce((s, p) => s + (p.amount ?? 0), 0);
      if (paid > 0) {
        revenue = paid;
      } else {
        // Proxy: sum of active memberships' price.
        revenue = all
          .filter((m) => m.status === "active")
          .reduce((s, m) => s + (m.price ?? 0), 0);
      }
    }
  }

  // Weekly bars: count of sessions per weekday (Mon..Sat) in the current month.
  const weeklyBars = buildWeeklyBars(sessions.map((s) => kstWeekday(s.scheduled_at)));

  // Expiring: active memberships within 14 days, scoped to this trainer's members.
  const today = todayISO();
  let expiringCount = 0;
  let expectedRevenue = 0;
  if (memberIds.length > 0) {
    const { data: expMs } = await sb
      .from("memberships")
      .select("member_id, end_date, price")
      .in("member_id", memberIds)
      .eq("status", "active");
    const expiring = (expMs ?? []).filter((m) => {
      const d = dayDiff(today, m.end_date);
      return d >= 0 && d <= 14;
    });
    expiringCount = expiring.length;
    const priceSum = expiring.reduce((s, m) => s + (m.price ?? 0), 0);
    expectedRevenue = priceSum > 0 ? priceSum : Math.round(expiringCount * 1_400_000);
  }

  return {
    monthLabel,
    revenue,
    revenueDelta: 0,
    classCount,
    memberCount,
    attendRate,
    weeklyBars,
    expiringCount,
    expectedRevenue,
  };
}

/** Mon..Sat bars from a list of weekday numbers (0=Sun..6=Sat). Scaled to px, max emphasized. */
function buildWeeklyBars(weekdays: number[]): PerfBar[] {
  const order = [1, 2, 3, 4, 5, 6]; // Mon..Sat
  const labels = ["월", "화", "수", "목", "금", "토"];
  const counts = order.map((wd) => weekdays.filter((w) => w === wd).length);
  const max = Math.max(...counts, 0);
  return order.map((_, i) => {
    const c = counts[i];
    const valuePx = Math.min(60, Math.max(8, c * 8));
    return {
      label: labels[i],
      valuePx,
      emphasized: max > 0 && c === max,
    };
  });
}

/* ----------------------------- retention ----------------------------- */
export async function getRetention(): Promise<RetentionView> {
  const t = await getTrainerContext();
  if (!t) {
    return { expiringCount: 0, expectedRevenue: 0, items: [], pendingCount: 0 };
  }

  const { data: links } = await sb
    .from("member_trainers")
    .select("member_id")
    .eq("trainer_id", t.id);
  const memberIds = Array.from(new Set((links ?? []).map((l) => l.member_id)));
  if (memberIds.length === 0) {
    return { expiringCount: 0, expectedRevenue: 0, items: [], pendingCount: 0 };
  }

  const { data: memberships } = await sb
    .from("memberships")
    .select("member_id, remaining_sessions, end_date, price, guided, status")
    .in("member_id", memberIds)
    .eq("status", "active");

  const today = todayISO();
  const expiring = (memberships ?? [])
    .map((m) => ({ ...m, dDay: dayDiff(today, m.end_date) }))
    .filter((m) => m.dDay >= 0 && m.dDay <= 14)
    .sort((a, b) => a.dDay - b.dDay);

  const expMemberIds = expiring.map((m) => m.member_id);
  const memberById = new Map<string, { name: string; avatar_tone: string }>();
  if (expMemberIds.length > 0) {
    const { data: members } = await sb
      .from("members")
      .select("id, name, avatar_tone")
      .in("id", expMemberIds);
    for (const mm of members ?? []) {
      memberById.set(mm.id, { name: mm.name, avatar_tone: mm.avatar_tone });
    }
  }

  const items = expiring.map((m) => {
    const info = memberById.get(m.member_id);
    const name = info?.name ?? "";
    return {
      memberId: m.member_id,
      name,
      initial: name.charAt(0),
      avatarTone: asTone(info?.avatar_tone),
      remaining: m.remaining_sessions,
      dDay: m.dDay,
      guided: !!m.guided,
    };
  });

  const priceSum = expiring.reduce((s, m) => s + (m.price ?? 0), 0);
  const expectedRevenue = priceSum > 0 ? priceSum : Math.round(items.length * 1_400_000);

  return {
    expiringCount: items.length,
    expectedRevenue,
    items,
    pendingCount: items.filter((i) => !i.guided).length,
  };
}
