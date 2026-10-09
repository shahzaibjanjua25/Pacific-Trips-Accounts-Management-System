// src/lib/auth-edge.ts
// Edge-safe session helpers — Web Crypto (HMAC-SHA256). Works on Node + Edge.

const SECRET =
  process.env.AUTH_SECRET || "pacific-trips-auth-secret-change-in-prod-2026";

export const COOKIE = "pt_session";

async function hmacHex(message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build the exact cookie value auth.ts stores: userId.token.exp.sig */
export async function signSessionValue(
  userId: string,
  token: string,
  exp: number
): Promise<string> {
  const sig = await hmacHex(`${userId}.${token}.${exp}`);
  return `${userId}.${token}.${exp}.${sig}`;
}

/** Verify a 4-part cookie value. Constant-time compare. */
export async function verifySessionValue(
  raw: string | undefined
): Promise<boolean> {
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 4) return false;
  const [userId, token, expStr, sig] = parts;
  const exp = Number(expStr);
  if (!userId || !token || !exp || !sig) return false;
  if (Date.now() > exp) return false;
  const expect = await hmacHex(`${userId}.${token}.${exp}`);
  if (expect.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expect.length; i++) {
    diff |= expect.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  return diff === 0;
}