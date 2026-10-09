import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession, ensureDefaultUser, verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await ensureDefaultUser();
    const { username, password } = await req.json();
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }
    await createSession(user.id);
    return NextResponse.json({ ok: true, username: user.username });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
