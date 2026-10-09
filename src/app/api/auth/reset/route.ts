import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyAnswer, ensureDefaultUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    await ensureDefaultUser();
    const { username, answer1, answer2, newPassword } = await req.json();
    if (!username || !answer1 || !answer2 || !newPassword) {
      return NextResponse.json({ error: "All fields required" }, { status: 400 });
    }
    if (String(newPassword).length < 10) {
      return NextResponse.json({ error: "Password must be at least 10 characters" }, { status: 400 });
    }
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    if (!verifyAnswer(answer1, user.securityA1Hash) || !verifyAnswer(answer2, user.securityA2Hash)) {
      return NextResponse.json({ error: "Security answers incorrect" }, { status: 401 });
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword) },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
