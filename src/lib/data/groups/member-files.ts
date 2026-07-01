import "server-only";
import { sb, getTrainerContext, getMemberContext } from "@/lib/data/db";
import type { FileKind } from "@/lib/media/upload-guard";

export const FILES_BUCKET = "member-files";
const SIGNED_TTL = 60 * 60; // 1시간

export type MemberFileView = {
  id: string;
  kind: FileKind;
  url: string | null;
  note: string | null;
  takenAt: string; // YYYY-MM-DD
};

async function signedUrlFor(path: string): Promise<string | null> {
  const { data } = await sb.storage.from(FILES_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return data?.signedUrl ?? null;
}

/** 대표는 전체, 강사는 담당 회원만. 접근 가능하면 { trainerId } 반환, 아니면 null. */
export async function trainerCanAccess(memberId: string): Promise<{ trainerId: string } | null> {
  const t = await getTrainerContext();
  if (!t) return null;
  if (t.role === "owner") return { trainerId: t.id };
  const { data } = await sb
    .from("member_trainers")
    .select("member_id")
    .eq("member_id", memberId)
    .eq("trainer_id", t.id)
    .maybeSingle();
  return data ? { trainerId: t.id } : null;
}

async function listFiles(memberId: string, kind?: FileKind): Promise<MemberFileView[]> {
  let q = sb
    .from("member_files")
    .select("id, kind, storage_path, note, taken_at")
    .eq("member_id", memberId)
    .order("taken_at", { ascending: false })
    .order("created_at", { ascending: false });
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return Promise.all(
    (data ?? []).map(async (r) => ({
      id: r.id as string,
      kind: r.kind as FileKind,
      url: await signedUrlFor(r.storage_path as string),
      note: (r.note as string | null) ?? null,
      takenAt: r.taken_at as string,
    })),
  );
}

/** 강사/대표 열람. 권한 없으면 빈 배열. */
export async function getMemberFiles(memberId: string, kind?: FileKind): Promise<MemberFileView[]> {
  if (!(await trainerCanAccess(memberId))) return [];
  return listFiles(memberId, kind);
}

/** 회원 본인 열람. */
export async function getMyFiles(kind?: FileKind): Promise<MemberFileView[]> {
  const me = await getMemberContext();
  if (!me) return [];
  return listFiles(me.memberId, kind);
}
