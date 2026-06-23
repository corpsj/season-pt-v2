import "server-only";
import {
  sb,
  getTrainerContext,
  todayISO,
  dayDiff,
} from "@/lib/data/db";
import type { AvatarTone, RetentionView } from "@/lib/types";

function asTone(t: string | null | undefined): AvatarTone {
  const tones: AvatarTone[] = ["sage", "sageMid", "sageSoft", "gold", "pending", "terracotta"];
  return tones.includes(t as AvatarTone) ? (t as AvatarTone) : "sage";
}

/* ----------------------------- retention ----------------------------- */
export async function getRetention(): Promise<RetentionView> {
  const t = await getTrainerContext();
  const empty: RetentionView = { expiringCount: 0, expectedRevenue: 0, items: [], pendingCount: 0 };
  if (!t) return empty;

  // 활성 회원권 조회: owner는 가게 전체, 강사는 본인 담당으로 한정.
  let msQuery = sb
    .from("memberships")
    .select("member_id, remaining_sessions, end_date, price, guided, status")
    .eq("status", "active");

  if (t.role !== "owner") {
    const { data: links } = await sb
      .from("member_trainers")
      .select("member_id")
      .eq("trainer_id", t.id);
    const memberIds = Array.from(new Set((links ?? []).map((l) => l.member_id)));
    if (memberIds.length === 0) return empty;
    msQuery = msQuery.in("member_id", memberIds);
  }

  const { data: memberships } = await msQuery;

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
