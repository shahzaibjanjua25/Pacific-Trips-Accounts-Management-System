import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { COOKIE, signSessionValue, verifySessionValue } from "./auth-edge";

const SECRET =
  process.env.AUTH_SECRET || "pacific-trips-auth-secret-change-in-prod-2026";
const SESSION_DAYS = 14;

/* ── Password ── */
export function hashPassword(plain: string) {
  if (plain.length < 10) throw new Error("Password must be at least 10 characters");
  return bcrypt.hashSync(plain, 12);
}
export function verifyPassword(plain: string, hash: string) {
  return bcrypt.compareSync(plain, hash);
}

/* ── Security answers ── */
export function hashAnswer(answer: string) {
  return createHash("sha256")
    .update(answer.trim().toLowerCase() + SECRET)
    .digest("hex");
}
export function verifyAnswer(answer: string, hash: string) {
  const a = Buffer.from(hashAnswer(answer));
  const b = Buffer.from(hash);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/* ── Session ── */
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const exp = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  const value = await signSessionValue(userId, token, exp);
  const jar = await cookies();
  jar.set(COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  const ok = await verifySessionValue(raw);
  if (!ok || !raw) return null;
  const [userId] = raw.split(".");
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  return user ? userId : null;
}

export async function requireAuth(): Promise<string> {
  const id = await getSessionUserId();
  if (!id) throw new Error("UNAUTHORIZED");
  return id;
}

/* ── Default user bootstrap ── */
export async function ensureDefaultUser() {
  const count = await prisma.user.count();
  if (count > 0) return;

  const username = process.env.DEFAULT_ADMIN_USERNAME || "admin";
  const password = process.env.DEFAULT_ADMIN_PASSWORD || "Pacific@Trips2026!";

  await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      securityQ1: "What city is Pacific Trips based in?",
      securityA1Hash: hashAnswer("Lahore"),
      securityQ2: "What is the company currency code?",
      securityA2Hash: hashAnswer("PKR"),
    },
  });

  console.log(
    `\n🔐 Default admin created\n   username: ${username}\n   password: ${password}\n   ⚠️  Change this after first login via /settings/security\n`
  );
}