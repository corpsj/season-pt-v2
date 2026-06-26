// Member session: signed cookie (HMAC-SHA256 via Web Crypto — works in Edge + Node).
// Format: base64url(JSON payload) + "." + base64url(HMAC). Trainer auth uses Supabase Auth instead.

export const MEMBER_COOKIE = "spt_member";
const RAW_SECRET = process.env.MEMBER_SESSION_SECRET;
const SECRET = RAW_SECRET || "dev-insecure-secret-change-me";
// fail-closed in prod: 시크릿이 없으면 위조 세션을 절대 발급/검증하지 않음(하드코딩 폴백 거부)
const SECRET_OK = !!RAW_SECRET || process.env.NODE_ENV !== "production";
const THIRTY_DAYS_MS = 30 * 86400000;

export type MemberSession = { memberId: string; name: string; exp?: number };

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

export async function signSession(payload: MemberSession): Promise<string> {
  if (!SECRET_OK) throw new Error("MEMBER_SESSION_SECRET is required in production");
  const full: MemberSession = { ...payload, exp: payload.exp ?? Date.now() + THIRTY_DAYS_MS };
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(full)));
  const sig = await hmac(body);
  return `${body}.${sig}`;
}

export async function verifySession(token?: string | null): Promise<MemberSession | null> {
  if (!token || !SECRET_OK) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = await hmac(body);
  // constant-time-ish compare
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const parsed = JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as MemberSession;
    if (parsed.exp && parsed.exp < Date.now()) return null; // 만료 토큰 거부
    return parsed;
  } catch {
    return null;
  }
}
