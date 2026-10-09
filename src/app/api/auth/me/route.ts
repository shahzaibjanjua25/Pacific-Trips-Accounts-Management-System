import { NextResponse } from "next/server";
import { getSessionUserId, ensureDefaultUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  await ensureDefaultUser();
  const id = await getSessionUserId();
  if (!id) return NextResponse.json({ user: null });
  const user = await prisma.user.findUnique({
    where: { id },
    select: { id: true, username: true, securityQ1: true, securityQ2: true },
  });
  return NextResponse.json({ user });
}
