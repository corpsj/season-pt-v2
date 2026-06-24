import "server-only";
import {
  sb,
  getTrainerContext,
  kstDateISO,
  clockHM,
  weekdayKo,
  todayISO,
} from "@/lib/data/db";
import type {
  AttendTarget,
  AvatarTone,
  ConfirmView,
  InboxView,
  SentItem,
  TeamAvatar,
} from "@/lib/types";

/* ------------------------------------------------------------------ helpers */

type SessionRow = {
  id: string;
  trainer_id: string;
  scheduled_at: string;
  type: "1on1" | "2on1";
  status: "scheduled" | "attended" | "noshow" | "cancelled";
};

type MemberRow = {
  id: string;
  name: string;
  avatar_tone: string;
};

const tone = (t: string | null | undefined): AvatarTone => (t ?? "sage") as AvatarTone;
const initialOf = (name: string): string => name.slice(0, 1);

/** Members attached to a session, ordered for stable team rendering. */
async function sessionMembers(sessionId: string): Promise<MemberRow[]> {
  // Single embedded join (was 2 serial round-trips: session_members then members).
  const { data } = await sb
    .from("session_members")
    .select("member_id, members(id, name, avatar_tone)")
    .eq("session_id", sessionId);
  return (data ?? [])
    .map((r) => (r as unknown as { members: MemberRow | null }).members)
    .filter((m): m is MemberRow => !!m);
}

/** Active membership remaining for a member (0 when none). */
async function remainingFor(memberId: string): Promise<number> {
  const { data } = await sb
    .from("memberships")
    .select("remaining_sessions")
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("end_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.remaining_sessions ?? 0;
}

function teamAvatarFrom(members: MemberRow[]): TeamAvatar {
  const [a, b] = members;
  return {
    init1: initialOf(a.name),
    tone1: tone(a.avatar_tone),
    init2: b ? initialOf(b.name) : "",
    tone2: b ? tone(b.avatar_tone) : "sage",
  };
}

/** Display name for a session: team members joined with "·", else the single member. */
function sessionName(members: MemberRow[]): string {
  return members.map((m) => m.name).join("·");
}

async function fetchSession(sessionId: string): Promise<SessionRow | null> {
  const { data } = await sb
    .from("sessions")
    .select("id, trainer_id, scheduled_at, type, status")
    .eq("id", sessionId)
    .maybeSingle();
  return (data as SessionRow) ?? null;
}

/** "6/21 토 · 오후 7:00" */
function slotLabel(iso: string): string {
  const dISO = kstDateISO(iso);
  const [, mo, da] = dISO.split("-").map(Number);
  const wd = new Date(dISO + "T00:00:00Z").getUTCDay();
  return `${mo}/${da} ${weekdayKo(wd)} · ${clockHM(iso)}`;
}

/* ------------------------------------------------------------ attend / record */

export async function getAttendTarget(sessionId: string): Promise<AttendTarget> {
  const session = await fetchSession(sessionId);
  const members = session ? await sessionMembers(sessionId) : [];
  const isTeam = (session?.type ?? "1on1") === "2on1";
  const first = members[0];
  // remaining shown reflects the (first) member's active membership
  const remaining = first ? await remainingFor(first.id) : 0;
  const timeLbl = session ? clockHM(session.scheduled_at) : "";
  const name = members.length ? sessionName(members) : "";
  return {
    sessionId,
    name,
    initial: first ? initialOf(first.name) : "",
    avatarTone: first ? tone(first.avatar_tone) : "sage",
    isTeam,
    team: isTeam && members.length >= 2 ? teamAvatarFrom(members) : undefined,
    meta: `${isTeam ? "2:1 PT" : "1:1 PT"} · ${timeLbl} · 잔여 ${remaining}회`,
    type: isTeam ? "2on1" : "1on1",
    remaining,
  };
}

export async function getRecordTarget(sessionId: string) {
  const session = await fetchSession(sessionId);
  const members = session ? await sessionMembers(sessionId) : [];
  const first = members[0];
  const isTeam = (session?.type ?? "1on1") === "2on1";
  const dISO = session ? kstDateISO(session.scheduled_at) : todayISO();
  const [, , da] = dISO.split("-").map(Number);
  return {
    sessionId,
    memberId: first?.id ?? "",
    name: members.length ? sessionName(members) : "",
    initial: first ? initialOf(first.name) : "",
    avatarTone: first ? tone(first.avatar_tone) : ("sage" as AvatarTone),
    dateLabel: `6월 ${da}일 · ${isTeam ? "2:1" : "1:1"} PT`,
    exercises: [] as { name: string; kg: number; sets: number }[],
  };
}

/* -------------------------------------------------------------- class detail */

export async function getClassDetail(sessionId: string) {
  const session = await fetchSession(sessionId);
  const members = session ? await sessionMembers(sessionId) : [];
  const isTeam = (session?.type ?? "1on1") === "2on1";
  const first = members[0];
  const remaining = first ? await remainingFor(first.id) : 0;
  const dISO = session ? kstDateISO(session.scheduled_at) : todayISO();
  const [, mo, da] = dISO.split("-").map(Number);
  const wd = new Date(dISO + "T00:00:00Z").getUTCDay();
  const timeRange = session
    ? `${clockHM(session.scheduled_at)}–${clockHM(new Date(new Date(session.scheduled_at).getTime() + 3600000))}`
    : "";
  return {
    sessionId,
    name: members.length ? sessionName(members) : "",
    initial: first ? initialOf(first.name) : "",
    avatarTone: first ? tone(first.avatar_tone) : ("sage" as AvatarTone),
    isTeam,
    team: isTeam && members.length >= 2 ? teamAvatarFrom(members) : undefined,
    typeLabel: `${isTeam ? "2:1" : "1:1"} PT · 잔여 ${remaining}회`,
    dateLabel: `${mo}월 ${da}일 ${weekdayKo(wd)} · ${timeRange}`,
  };
}

/* --------------------------------------------------------------- propose */

export async function getProposeSlots(sessionId: string) {
  const session = await fetchSession(sessionId);
  const members = session ? await sessionMembers(sessionId) : [];
  const before = session ? slotLabel(session.scheduled_at) : "";
  // Generate a few upcoming candidate times from the session's hour.
  // candidate times preserve the session's exact time-of-day (incl. minutes)
  const baseMs = session ? new Date(session.scheduled_at).getTime() : Date.now();
  const slots = Array.from({ length: 4 }, (_, i) => {
    const iso = new Date(baseMs + (i + 1) * 86400000).toISOString();
    const dISO = kstDateISO(iso);
    const [, mo, da] = dISO.split("-").map(Number);
    const wd = new Date(dISO + "T00:00:00Z").getUTCDay();
    return { id: `p${i + 1}`, label: `${mo}/${da} ${weekdayKo(wd)} · ${clockHM(iso)}`, iso };
  });
  return {
    before,
    memberName: members.length ? sessionName(members) : "",
    slots,
    reasons: ["개인 일정", "시설 점검", "직접 입력"],
  };
}

/* ----------------------------------------------------------------- inbox */

type RequestRow = {
  id: string;
  session_id: string;
  requester_type: "trainer" | "member";
  requester_id: string;
  type: "change" | "cancel";
  status: "pending" | "accepted" | "rejected";
  reason: string | null;
  original_at: string | null;
  proposed_slots: string[] | null;
  created_at: string;
};

function agoLabel(createdAt: string): string {
  const diffMs = Date.now() - new Date(createdAt).getTime();
  const min = Math.max(1, Math.floor(diffMs / 60000));
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  return day === 1 ? "어제" : `${day}일 전`;
}

export async function getInbox(): Promise<InboxView> {
  const t = await getTrainerContext();
  if (!t) {
    return { receivedCount: 0, sentCount: 0, received: [], sent: [] };
  }

  // Sessions owned by this trainer.
  const { data: sessRows } = await sb
    .from("sessions")
    .select("id")
    .eq("trainer_id", t.id);
  const sessionIds = (sessRows ?? []).map((s) => s.id as string);
  if (sessionIds.length === 0) {
    return { receivedCount: 0, sentCount: 0, received: [], sent: [] };
  }

  const { data: reqRows } = await sb
    .from("schedule_change_requests")
    .select(
      "id, session_id, requester_type, requester_id, type, status, reason, original_at, proposed_slots, created_at",
    )
    .in("session_id", sessionIds)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  const requests = (reqRows ?? []) as RequestRow[];

  // First member of each involved session → name/avatar. One batched query (was N+1).
  const involved = Array.from(new Set(requests.map((r) => r.session_id)));
  const firstMemberBySession = new Map<string, MemberRow>();
  if (involved.length) {
    const { data: smRows } = await sb
      .from("session_members")
      .select("session_id, members(id, name, avatar_tone)")
      .in("session_id", involved);
    for (const row of smRows ?? []) {
      const r = row as unknown as { session_id: string; members: MemberRow | null };
      if (r.members && !firstMemberBySession.has(r.session_id)) {
        firstMemberBySession.set(r.session_id, r.members);
      }
    }
  }

  const received = requests
    .filter((r) => r.requester_type === "member")
    .map((r) => {
      const m = firstMemberBySession.get(r.session_id);
      const name = m?.name ?? "";
      return {
        id: r.id,
        name,
        initial: name ? initialOf(name) : "",
        avatarTone: tone(m?.avatar_tone),
        ago: agoLabel(r.created_at),
        type: r.type,
        before: r.original_at ? slotLabel(r.original_at) : undefined,
        after:
          r.type === "change" && r.proposed_slots && r.proposed_slots.length
            ? slotLabel(r.proposed_slots[0])
            : undefined,
        reason: r.reason ?? undefined,
      };
    });

  const sent = requests
    .filter((r) => r.requester_type === "trainer")
    .map<SentItem>((r) => {
      const m = firstMemberBySession.get(r.session_id);
      const before = r.original_at ? slotLabel(r.original_at) : "";
      const after =
        r.proposed_slots && r.proposed_slots.length ? slotLabel(r.proposed_slots[0]) : "";
      const summary =
        r.type === "change" && before && after ? `${before} → ${after}` : "수업 취소 요청";
      return { id: r.id, name: m?.name ?? "", summary, status: "awaiting" };
    });

  return {
    receivedCount: received.length,
    sentCount: sent.length,
    received,
    sent,
  };
}

/* --------------------------------------------------------------- confirm */

export async function getConfirm(): Promise<ConfirmView> {
  // Static success view — the most recently accepted change for this trainer, if any.
  const t = await getTrainerContext();
  if (t) {
    const { data: sessRows } = await sb
      .from("sessions")
      .select("id, scheduled_at")
      .eq("trainer_id", t.id);
    const sessions = sessRows ?? [];
    const sessionIds = sessions.map((s) => s.id as string);
    if (sessionIds.length) {
      const { data: reqRows } = await sb
        .from("schedule_change_requests")
        .select("session_id, original_at, proposed_slots")
        .in("session_id", sessionIds)
        .eq("type", "change")
        .eq("status", "accepted")
        .order("resolved_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (reqRows && reqRows.original_at) {
        const after =
          (reqRows.proposed_slots && (reqRows.proposed_slots as string[])[0]) ||
          reqRows.original_at;
        const remaining = await (async () => {
          const ms = await sessionMembers(reqRows.session_id as string);
          return ms[0] ? remainingFor(ms[0].id) : 0;
        })();
        return {
          before: slotLabel(reqRows.original_at),
          after: slotLabel(after),
          remainingKept: remaining,
        };
      }
    }
  }
  return { before: "", after: "", remainingKept: 0 };
}
