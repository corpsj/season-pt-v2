import "server-only";
import { sb, getTrainerContext, kstDateISO, todayISO } from "@/lib/data/db";
import { slotLabel } from "./scheduling";
import { parseWorkoutExercises } from "@/lib/data/workout-sets";
import type {
  ClassWorkspace,
  WorkspaceMember,
} from "@/lib/data/class-workflow-types";

export async function getClassWorkspace(
  sessionId: string,
): Promise<ClassWorkspace | null> {
  const t = await getTrainerContext();
  if (!t) return null;
  let query = sb
    .from("sessions")
    .select("id,trainer_id,scheduled_at,status,attendance_version")
    .eq("id", sessionId);
  if (t.role !== "owner") query = query.eq("trainer_id", t.id);
  const { data: s, error } = await query.maybeSingle();
  if (error)
    throw new Error(
      "수업 정보를 불러오지 못했어요. 데이터베이스 업데이트 상태를 확인해주세요.",
    );
  if (!s) return null;
  const { data: links, error: linkError } = await sb
    .from("session_members")
    .select("member_id,members(name,avatar_tone)")
    .eq("session_id", sessionId)
    .order("member_id");
  if (linkError) throw new Error("회원 정보를 불러오지 못했어요.");
  const ids = (links ?? []).map((r) => r.member_id as string);
  if (!ids.length) return null;
  const date = kstDateISO(s.scheduled_at);
  const [drafts, records, previous, memberships, audit] = await Promise.all([
    sb
      .from("class_workout_drafts")
      .select("member_id,exercises,comment,version")
      .eq("session_id", sessionId),
    sb
      .from("workout_records")
      .select("member_id,exercises,comment")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false }),
    sb
      .from("workout_records")
      .select("member_id,exercises,created_at")
      .in("member_id", ids)
      .or(`session_id.neq.${s.id},session_id.is.null`)
      .lt("created_at", s.scheduled_at)
      .order("created_at", { ascending: false })
      .limit(100),
    sb
      .from("memberships")
      .select("member_id,remaining_sessions")
      .in("member_id", ids)
      .eq("status", "active")
      .lte("start_date", date)
      .gte("end_date", date),
    sb
      .from("class_operations")
      .select("created_at,request")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  if ([drafts, records, previous, memberships, audit].some((r) => r.error))
    throw new Error(
      "운동 기록을 불러오지 못했어요. 새로고침 후 다시 시도해주세요.",
    );
  const members: WorkspaceMember[] = (links ?? []).map((r) => {
    const m = r.members as unknown as {
      name: string;
      avatar_tone: WorkspaceMember["avatarTone"];
    } | null;
    const d = drafts.data?.find((v) => v.member_id === r.member_id);
    const record = records.data?.find((v) => v.member_id === r.member_id);
    const prev = previous.data?.find((v) => v.member_id === r.member_id);
    return {
      memberId: r.member_id,
      name: m?.name ?? "회원",
      initial: m?.name.slice(0, 1) ?? "",
      avatarTone: m?.avatar_tone ?? "sage",
      exercises: parseWorkoutExercises(d?.exercises ?? record?.exercises),
      comment: d?.comment ?? record?.comment ?? "",
      version: d?.version ?? 0,
      remaining: (memberships.data ?? [])
        .filter((v) => v.member_id === r.member_id)
        .reduce((n, v) => n + v.remaining_sessions, 0),
      previous: parseWorkoutExercises(prev?.exercises),
      previousDate: prev ? kstDateISO(prev.created_at) : null,
    };
  });
  const history = (audit.data ?? []).map((r) => {
    const req = r.request as { action?: string; reason?: string };
    return {
      action: req.action ?? "",
      reason: req.reason ?? "",
      at: r.created_at,
    };
  });
  return {
    editorId: t.id,
    sessionId,
    attendanceVersion: s.attendance_version,
    status: s.status,
    scheduledAt: s.scheduled_at,
    canComplete: date <= todayISO(),
    dateLabel: slotLabel(s.scheduled_at),
    members,
    history,
  };
}
