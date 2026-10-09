import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * Return all transactions linked to a specific entity.
 * GET /api/linked-transactions?type=payable&id=xxx
 */
export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const type = req.nextUrl.searchParams.get("type");
  const id = req.nextUrl.searchParams.get("id");
  if (!type || !id) {
    return NextResponse.json({ error: "type and id required" }, { status: 400 });
  }

  const links = await prisma.transactionLink.findMany({
    where: { entityType: type, entityId: id },
    include: { transaction: true },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(links);
}