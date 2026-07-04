import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// 강사 비밀번호를 대표가 나중에 다시 조회할 수 있도록 AES-256-GCM으로 암호화.
// Supabase Auth의 비밀번호 해시(단방향)와는 별개 — 콘솔 "저장된 비밀번호 보기" 전용.
function key(): Buffer {
  const raw = process.env.CREDENTIAL_ENC_KEY;
  if (!raw) throw new Error("CREDENTIAL_ENC_KEY가 설정되지 않았어요");
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) throw new Error("CREDENTIAL_ENC_KEY는 base64 인코딩된 32바이트 키여야 해요");
  return buf;
}

export function encryptCredential(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64");
}

export function decryptCredential(enc: string): string {
  const raw = Buffer.from(enc, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
