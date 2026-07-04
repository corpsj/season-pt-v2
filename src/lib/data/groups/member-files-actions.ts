"use server";
import { revalidatePath } from "next/cache";
import { sb, getMemberContext } from "@/lib/data/db";
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

  // 확장자와 contentType를 검증된 MIME에서 함께 도출 — 파일명(.jpg)과 실제 타입(image/heic)이
  // 어긋나 저장되는 것을 막는다. EXT에 없는 타입(HEIC 등)은 여기서 거부.
  const ext = EXT[file.type];
  if (!ext) return { ok: false, error: "지원하지 않는 파일 형식이에요" };
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
  revalidatePath("/m"); // 캘린더 날짜별 체형 기록도 갱신
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

  const { error: storErr } = await sb.storage.from(FILES_BUCKET).remove([row.storage_path as string]);
  const { error: delErr } = await sb.from("member_files").delete().eq("id", fileId);
  if (storErr || delErr) return { ok: false, error: "삭제에 실패했어요" };

  revalidatePath(`/t/members/${row.member_id as string}`);
  revalidatePath("/m/my/body");
  revalidatePath("/m"); // 캘린더 날짜별 체형 기록도 갱신
  return { ok: true };
}

/** 회원 본인이 진행 사진을 업로드. photo만 허용(인바디는 강사 전용). created_by는 null. */
export async function uploadMyFile(formData: FormData): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "권한이 없어요" };

  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "파일이 없어요" };

  // 찍은 날짜(선택) — 지난 날짜 허용, 미래 거부. 미지정은 DB default(오늘).
  const takenAtRaw = (formData.get("takenAt") as string | null)?.trim() || null;
  let takenAt: string | null = null;
  if (takenAtRaw && /^\d{4}-\d{2}-\d{2}$/.test(takenAtRaw)) {
    const todayKst = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    if (takenAtRaw > todayKst) return { ok: false, error: "미래 날짜는 기록할 수 없어요" };
    takenAt = takenAtRaw;
  }

  const kind: FileKind = "photo"; // 회원 셀프 업로드는 진행 사진만
  const v = validateUpload(kind, file.type, file.size);
  if (!v.ok) return { ok: false, error: v.error };

  // 확장자·contentType를 검증된 MIME에서 함께 도출(HEIC 등 이형 저장 방지)
  const ext = EXT[file.type];
  if (!ext) return { ok: false, error: "지원하지 않는 사진 형식이에요" };
  const path = `${me.memberId}/${kind}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await sb.storage
    .from(FILES_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) return { ok: false, error: "업로드에 실패했어요" };

  const { error: insErr } = await sb
    .from("member_files")
    .insert({ member_id: me.memberId, kind, storage_path: path, created_by: null, ...(takenAt ? { taken_at: takenAt } : {}) });
  if (insErr) {
    await sb.storage.from(FILES_BUCKET).remove([path]); // 고아 객체 롤백
    return { ok: false, error: "저장에 실패했어요" };
  }

  revalidatePath("/m/my/body");
  revalidatePath("/m");
  revalidatePath(`/t/members/${me.memberId}`);
  return { ok: true };
}

/** 회원 본인이 올린 진행 사진 삭제 — 본인 소유 + photo만. */
export async function deleteMyFile(fileId: string): Promise<Result> {
  const me = await getMemberContext();
  if (!me) return { ok: false, error: "권한이 없어요" };

  const { data: row } = await sb
    .from("member_files")
    .select("member_id, kind, storage_path")
    .eq("id", fileId)
    .maybeSingle();
  if (!row) return { ok: false, error: "파일을 찾을 수 없어요" };
  if (row.member_id !== me.memberId || row.kind !== "photo") return { ok: false, error: "권한이 없어요" };

  const { error: storErr } = await sb.storage.from(FILES_BUCKET).remove([row.storage_path as string]);
  const { error: delErr } = await sb.from("member_files").delete().eq("id", fileId);
  if (storErr || delErr) return { ok: false, error: "삭제에 실패했어요" };

  revalidatePath("/m/my/body");
  revalidatePath("/m");
  revalidatePath(`/t/members/${me.memberId}`);
  return { ok: true };
}

/** 대표 콘솔(클라이언트)에서 회원 선택 시 파일 조회 — getMemberFiles가 권한 검증. */
export async function listMemberFiles(memberId: string, kind?: FileKind): Promise<Awaited<ReturnType<typeof getMemberFiles>>> {
  return getMemberFiles(memberId, kind);
}
