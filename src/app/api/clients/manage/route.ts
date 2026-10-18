// src/app/api/clients/manage/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { setSaleForClient, clearSaleForClient } from "@/lib/sales-sync";

/** Move a delta in/out of a named bank account. Positive = money in. */
async function adjustBank(accountName: string | null | undefined, delta: number) {
  if (!accountName || delta === 0) return;
  const trimmed = String(accountName).trim();
  if (!trimmed) return;

  const normalized = trimmed.toLowerCase();
  const all = await prisma.bankBalance.findMany();
  const existing = all.find(
    (b) => b.accountName.trim().toLowerCase() === normalized
  );

  if (existing) {
    await prisma.bankBalance.update({
      where: { id: existing.id },
      data: { balance: existing.balance + delta },
    });
  } else {
    await prisma.bankBalance.create({
      data: { accountName: trimmed, balance: Math.max(0, delta) },
    });
  }
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const periodId = req.nextUrl.searchParams.get("periodId");
  const recv = periodId
    ? await prisma.receivable.findFirst({
        where: { periodId, clientId: id },
        orderBy: { createdAt: "desc" },
      })
    : null;

  return NextResponse.json({ client, receivable: recv });
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

    const existing = await prisma.client.findFirst({ where: { name } });
    if (existing) {
      return NextResponse.json(
        { error: "Client already exists", id: existing.id },
        { status: 409 }
      );
    }

    const client = await prisma.client.create({
      data: {
        name,
        phone: body.phone || null,
        contact: body.contact || null,
        email: body.email || null,
        notes: body.notes || null,
      },
    });

    const periodId = req.nextUrl.searchParams.get("periodId") || body.periodId;
    const tp = Number(body.totalPackage) || 0;
    const paid = Number(body.amountPaid) || 0;
    const salesperson = (body.salesperson || "").trim();
    const bankAccount = (body.bankAccount || "").trim() || null;

    if (periodId && (tp > 0 || paid > 0)) {
      const remaining = Math.max(0, tp - paid);
      await prisma.receivable.create({
        data: {
          periodId,
          clientId: client.id,
          clientName: client.name,
          salesperson: salesperson || null,
          bankAccount,
          totalPackage: tp || paid,
          amountToReceive: tp || paid,
          amountReceived: paid,
          remainingAmount: remaining,
          status:
            remaining <= 0 && paid > 0
              ? "Settled"
              : paid > 0
                ? "Partial"
                : "Open",
          notes: "Created from Clients page",
        },
      });

      if (paid > 0) {
        await adjustBank(bankAccount, paid);
      }

      if (salesperson && (tp || paid) > 0) {
        await setSaleForClient({
          periodId,
          salesperson,
          clientName: client.name,
          amount: tp || paid,
          description: `New client: ${client.name}`,
        });
      }
    }

    return NextResponse.json(client);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      id, name, phone, contact, email, notes,
      totalPackage, amountPaid, salesperson, bankAccount,
    } = body;
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const client = await prisma.client.update({
      where: { id },
      data: {
        name: name ?? undefined,
        phone: phone ?? undefined,
        contact: contact ?? undefined,
        email: email ?? undefined,
        notes: notes ?? undefined,
      },
    });

    const periodId = req.nextUrl.searchParams.get("periodId");
    if (periodId && (totalPackage != null || amountPaid != null || salesperson || bankAccount)) {
      const existing = await prisma.receivable.findFirst({
        where: { periodId, clientId: id },
        orderBy: { createdAt: "desc" },
      });

      const tp = Number(totalPackage) || 0;
      const paid = Number(amountPaid) || 0;
      const remaining = Math.max(0, tp - paid);
      const nextBank = (typeof bankAccount === "string" ? bankAccount : "").trim() || null;

      if (existing) {
        const prevTp = existing.totalPackage;
        const prevPaid = existing.amountReceived || 0;
        const prevBank = existing.bankAccount || null;
        const prevSalesperson = (existing.salesperson || "").trim();
        const nextSalesperson = (
          (typeof salesperson === "string" ? salesperson : prevSalesperson) || ""
        ).trim();

        await prisma.receivable.update({
          where: { id: existing.id },
          data: {
            totalPackage: tp || existing.totalPackage,
            amountToReceive: tp || existing.amountToReceive,
            amountReceived: paid,
            remainingAmount: remaining,
            salesperson: salesperson ?? existing.salesperson,
            bankAccount: nextBank ?? existing.bankAccount,
            status:
              remaining <= 0 && paid > 0
                ? "Settled"
                : paid > 0
                  ? "Partial"
                  : "Open",
          },
        });

        // ── Bank effect ─────────────────────────────────────
        // If account changed → reverse old, apply full new amount to new acct
        // If same account      → apply only the paid delta
        if (nextBank && prevBank && nextBank.toLowerCase() !== prevBank.toLowerCase()) {
          if (prevPaid > 0) await adjustBank(prevBank, -prevPaid);
          if (paid > 0)     await adjustBank(nextBank, paid);
        } else {
          const paidDelta = paid - prevPaid;
          if (paidDelta !== 0) {
            await adjustBank(nextBank ?? prevBank, paidDelta);
          }
        }

        // ── Sales Team sync ─────────────────────────────────
        // One row per (client, salesperson). setSaleForClient upserts.
        const packageForSale = (tp > 0 ? tp : existing.totalPackage) || 0;
        const salespersonChanged =
          prevSalesperson.toLowerCase() !== nextSalesperson.toLowerCase();

        if (salespersonChanged) {
          // Remove old owner's row, then set new owner's row to full package
          if (prevSalesperson) {
            await clearSaleForClient({
              periodId,
              salesperson: prevSalesperson,
              clientName: client.name,
            });
          }
          if (nextSalesperson && packageForSale > 0) {
            await setSaleForClient({
              periodId,
              salesperson: nextSalesperson,
              clientName: client.name,
              amount: packageForSale,
              description: `Reassigned sale: ${client.name}`,
            });
          }
        } else if (nextSalesperson && packageForSale > 0) {
          // Same salesperson — set to the new package value (upsert)
          // This handles BOTH increases and decreases.
          await setSaleForClient({
            periodId,
            salesperson: nextSalesperson,
            clientName: client.name,
            amount: packageForSale,
            description:
              packageForSale > prevTp
                ? `Package increase: ${client.name}`
                : packageForSale < prevTp
                  ? `Package reduced: ${client.name}`
                  : `Sale to ${client.name}`,
          });
        } else if (!nextSalesperson && prevSalesperson) {
          // Salesperson cleared → drop their rows for this client
          await clearSaleForClient({
            periodId,
            salesperson: prevSalesperson,
            clientName: client.name,
          });
        }
      } else if (tp > 0 || paid > 0) {
        await prisma.receivable.create({
          data: {
            periodId,
            clientId: id,
            clientName: client.name,
            salesperson: salesperson || null,
            bankAccount: nextBank,
            totalPackage: tp,
            amountToReceive: tp,
            amountReceived: paid,
            remainingAmount: remaining,
            status:
              remaining <= 0 && paid > 0
                ? "Settled"
                : paid > 0
                  ? "Partial"
                  : "Open",
            notes: "Edited from Clients page",
          },
        });

        if (paid > 0) {
          await adjustBank(nextBank, paid);
        }

        if (salesperson && tp > 0) {
          await setSaleForClient({
            periodId,
            salesperson,
            clientName: client.name,
            amount: tp,
            description: `New client (edited): ${client.name}`,
          });
        }
      }
    }

    return NextResponse.json({ ok: true, client });
  } catch (e) {
    console.error("[clients:manage:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) return NextResponse.json({ ok: true, alreadyGone: true });

  // Clear any sales rows for this client across periods we can see
  const periodId = req.nextUrl.searchParams.get("periodId");
  if (periodId) {
    await clearSaleForClient({ periodId, clientName: client.name });
  }

  await prisma.clientLedger.deleteMany({ where: { clientId: id } });
  await prisma.receivable.deleteMany({ where: { clientId: id } });
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}