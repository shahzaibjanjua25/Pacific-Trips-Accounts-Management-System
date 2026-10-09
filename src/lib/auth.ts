import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { createHash, randomBytes } from "crypto";

const COOKIE = "pt_session";
const SECRET = process.env.AUTH_SECRET || "pacific-trips-auth-secret-change-in-prod-2026";

export function hashPassword(plain: string) {
  return bcrypt.hashSync(plain, 12);
}

export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compareSync(plain, hash);
}

export function hashAnswer(answer: string) {
  return createHash("sha256")
    .update(answer.trim().toLowerCase() + SECRET)
    .digest("hex");
}

export function verifyAnswer(answer: string, hash: string) {
  return hashAnswer(answer) === hash;
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const value = `${userId}.${token}.${createHash("sha256").update(userId + token + SECRET).digest("hex")}`;
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (!raw) return null;
  const [userId, token, sig] = raw.split(".");
  if (!userId || !token || !sig) return null;
  const expect = createHash("sha256").update(userId + token + SECRET).digest("hex");
  if (sig !== expect) return null;
  return userId;
}

export async function requireAuth(): Promise<string> {
  const id = await getSessionUserId();
  if (!id) throw new Error("UNAUTHORIZED");
  return id;
}

/** Ensure default admin exists */
export async function ensureDefaultUser() {
  const count = await prisma.user.count();
  if (count > 0) return;
  await prisma.user.create({
    data: {
      username: "admin",
      passwordHash: hashPassword("Pacific@Trips2026!"),
      securityQ1: "What city is Pacific Trips based in?",
      securityA1Hash: hashAnswer("Lahore"),
      securityQ2: "What is the company currency code?",
      securityA2Hash: hashAnswer("PKR"),
    },
  });
}
