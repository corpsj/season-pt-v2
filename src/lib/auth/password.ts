import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

/** Member password hashing (scrypt). Node runtime only (server actions / seed). */
export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const dk = scryptSync(pw, salt, 32);
  return `scrypt$${salt.toString("hex")}$${dk.toString("hex")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const parts = stored.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  const dk = scryptSync(pw, salt, 32);
  return expected.length === dk.length && timingSafeEqual(expected, dk);
}
