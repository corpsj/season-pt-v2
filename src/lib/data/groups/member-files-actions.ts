"use server";
import { revalidatePath } from "next/cache";
import { sb } from "@/lib/data/db";
import { validateUpload, type FileKind } from "@/lib/media/upload-guard";
import { FILES_BUCKET, getMemberFiles, trainerCanAccess } from "./member-files";

type Result = { ok: boolean; error?: string };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

/** 강사(담당) 또는 대표가 회원에 사진/인바디 파일을 업로드. */
export async function uploadMemberFile(formData: FormData): Promise<Result> {
  const memberId = String(formData.get("memberId") ?? "");
  const kind = String(formData.get("kind") ?? "") as FileKind;
  const note = (formData.get("note") as string | null)?.trim() || null;
  const takenAt = (formData.get("takenAt") as string | null) || null;
  const file = formData.get("file");

  if (!memberId || (kind !== "photo" && kind !== "inbody")) return { ok: false, error: "잘못된 요청이에요" };
  if (!(file instanceof File)) return { ok: false, error: "파일이 없어요" };

  const access = await trainerCanAccess(memberId);
  if (!access) return { ok: false, error: "권한이 없어요" };

  const v = validateUpload(kind, file.type, file.size);
  if (!v.ok) return { ok: false, error: v.error };

  const ext = EXT[file.type] ?? (kind === "inbody" ? "pdf" : "jpg");
  const path = `${memberId}/${kind}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(FILES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: "업로드에 실패했어요" };

  const row: Record<string, unknown> = {
    member_id: memberId,
    kind,
    storage_path: path,
    note,
    created_by: access.trainerId,
  };
  if (takenAt) row.taken_at = takenAt;

  const { error: insErr } = await sb.from("member_files").insert(row);
  if (insErr) {
    await sb.storage.from(FILES_BUCKET).remove([path]); // 고아 객체 롤백
    return { ok: false, error: "저장에 실패했어요" };
  }

  revalidatePath(`/t/members/${memberId}`);
  revalidatePath("/m/my/body");
  return { ok: true };
}

/** 강사(담당)/대표가 파일 삭제 — Storage 객체와 행을 함께 제거. */
export async function deleteMemberFile(fileId: string): Promise<Result> {
  const { data: row } = await sb
    .from("member_files")
    .select("member_id, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!row) return { ok: false, error: "파일을 찾을 수 없어요" };
  if (!(await trainerCanAccess(row.member_id as string))) return { ok: false, error: "권한이 없어요" };

  await sb.storage.from(FILES_BUCKET).remove([row.storage_path as string]);
  await sb.from("member_files").delete().eq("id", fileId);

  revalidatePath(`/t/members/${row.member_id as string}`);
  revalidatePath("/m/my/body");
  return { ok: true };
}

/** 대표 콘솔(클라이언트)에서 회원 선택 시 파일 조회 — getMemberFiles가 권한 검증. */
export async function listMemberFiles(memberId: string, kind?: FileKind): Promise<Awaited<ReturnType<typeof getMemberFiles>>> {
  return getMemberFiles(memberId, kind);
}
