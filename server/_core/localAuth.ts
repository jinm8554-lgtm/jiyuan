import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LENGTH = 64;

export function hashLocalPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt}$${key.toString("hex")}`;
}

export function verifyLocalPassword(password: string, encoded: string | null): boolean {
  if (!encoded) return false;
  const [algorithm, salt, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !salt || !expectedHex || expectedHex.length % 2 !== 0) return false;

  try {
    const expected = Buffer.from(expectedHex, "hex");
    const actual = scryptSync(password, salt, expected.length);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function localOpenId(username: string): string {
  return `local:${username.trim().toLowerCase()}`;
}
