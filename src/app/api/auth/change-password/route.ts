import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  getSessionUserId,
  hashPassword,
  verifyPassword,
  hashAnswer,
  verifyAnswer,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const uid = await getSessionUserId();
    if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { currentPassword, newPassword, securityQ1, securityQ2, answer1, answer2 } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: "currentPassword and newPassword required" }, { status: 400 });
    }
    if (String(newPassword).length < 10) {
      return NextResponse.json({ error: "New password must be at least 10 characters" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: uid } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    if (!verifyPassword(currentPassword, user.passwordHash)) {
      return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
    }

    const data: Record<string, unknown> = { passwordHash: hashPassword(newPassword) };

    // Optionally update security questions if all four provided
    if (securityQ1 && securityQ2 && answer1 && answer2) {
      data.securityQ1 = securityQ1;
      data.securityA1Hash = hashAnswer(answer1);
      data.securityQ2 = securityQ2;
      data.securityA2Hash = hashAnswer(answer2);
    }

    await prisma.user.update({ where: { id: uid }, data });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Change failed" }, { status: 500 });
  }
}