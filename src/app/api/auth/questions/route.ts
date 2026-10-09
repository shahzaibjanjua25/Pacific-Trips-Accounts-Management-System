import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ensureDefaultUser } from "@/lib/auth";

export async function GET(req: NextRequest) {
  await ensureDefaultUser();
  const username = req.nextUrl.searchParams.get("username");
  if (!username) return NextResponse.json({ error: "username required" }, { status: 400 });
  const user = await prisma.user.findUnique({
    where: { username },
    select: { securityQ1: true, securityQ2: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  return NextResponse.json(user);
}
