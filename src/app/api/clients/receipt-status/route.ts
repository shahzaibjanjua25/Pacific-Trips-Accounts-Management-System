import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/auth";
import { clientReceiptGroups } from "@/lib/client-receipts";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { periodId, clientName, action } = await req.json();
    if (typeof periodId !== "string" || typeof clientName !== "string" ||
        !["reopen", "complete"].includes(action)) {
      return NextResponse.json({ error: "Choose a client and accounting month." }, { status: 400 });
    }
    const result = await prisma.$transaction(async (db) => {
      const group = (await clientReceiptGroups(periodId, db)).get(clientName);
      if (!group) return "missing";
      if (!group.fullyPaid) return "owing";
      if (action === "reopen") {
        await db.clientReceiptReopening.upsert({
          where: { periodId_clientName: { periodId, clientName } },
          create: { periodId, clientName, balanceSignature: group.signature },
          update: { balanceSignature: group.signature },
        });
      } else {
        await db.clientReceiptReopening.deleteMany({ where: { periodId, clientName } });
      }
      return "updated";
    }, { isolationLevel: "Serializable", timeout: 30_000 });
    if (result === "missing") return NextResponse.json({ error: "Client not found in this month." }, { status: 404 });
    if (result === "owing") {
      return NextResponse.json({ error: "This client's balance changed. Refresh to see their current payment status." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
      return NextResponse.json({ error: "Payments changed during this action. Refresh and try again." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Could not update client status." }, { status: 500 });
  }
}
