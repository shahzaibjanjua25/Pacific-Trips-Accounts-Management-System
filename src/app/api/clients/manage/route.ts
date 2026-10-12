import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";
import { attributeSaleToSalesperson } from "@/lib/sales-attribution";

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

    if (periodId && (tp > 0 || paid > 0)) {
      const remaining = Math.max(0, tp - paid);
      await prisma.receivable.create({
        data: {
          periodId,
          clientId: client.id,
          clientName: client.name,
          salesperson: salesperson || null,
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

      // Attribute the sale to the chosen salesperson â†’ Sales Team + commission
      if (salesperson && (tp || paid) > 0) {
        await attributeSaleToSalesperson({
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
      totalPackage, amountPaid, salesperson,
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
    if (periodId && (totalPackage != null || amountPaid != null || salesperson)) {
      const existing = await prisma.receivable.findFirst({
        where: { periodId, clientId: id },
        orderBy: { createdAt: "desc" },
      });

      const tp = Number(totalPackage) || 0;
      const paid = Number(amountPaid) || 0;
      const remaining = Math.max(0, tp - paid);

      if (existing) {
        const prevTp = existing.totalPackage;
        await prisma.receivable.update({
          where: { id: existing.id },
          data: {
            totalPackage: tp || existing.totalPackage,
            amountToReceive: tp || existing.amountToReceive,
            amountReceived: paid,
            remainingAmount: remaining,
            salesperson: salesperson ?? existing.salesperson,
            status:
              remaining <= 0 && paid > 0
                ? "Settled"
                : paid > 0
                  ? "Partial"
                  : "Open",
          },
        });

        // Sales Team: package increase OR salesperson change must update
        // SalesPerformance (single source of truth for commissions).
        const delta = Math.max(0, (tp || existing.totalPackage) - prevTp);
        const prevSalesperson = (existing.salesperson || "").trim();
        const nextSalesperson = (
          (typeof salesperson === "string" ? salesperson : prevSalesperson) || ""
        ).trim();
        const packageForSale =
          (tp > 0 ? tp : existing.totalPackage) || 0;
        const salespersonChanged =
          prevSalesperson.toLowerCase() !== nextSalesperson.toLowerCase();

        if (salespersonChanged && packageForSale > 0) {
          // Remove prior attribution for this client in this period
          if (prevSalesperson) {
            await prisma.salesPerformance.deleteMany({
              where: {
                periodId,
                clientName: client.name,
                employeeName: prevSalesperson,
              },
            });
            const { computeSalesPayroll } = await import(
              "@/lib/payroll-service"
            );
            const { syncPayrollForEmployee } = await import(
              "@/lib/links-service"
            );
            await computeSalesPayroll(periodId);
            await syncPayrollForEmployee(periodId, prevSalesperson);
          }
          if (nextSalesperson) {
            await attributeSaleToSalesperson({
              periodId,
              salesperson: nextSalesperson,
              clientName: client.name,
              amount: packageForSale,
              description: `Reassigned sale: ${client.name}`,
            });
          }
        } else if (nextSalesperson && delta > 0) {
          await attributeSaleToSalesperson({
            periodId,
            salesperson: nextSalesperson,
            clientName: client.name,
            amount: delta,
            description: `Package increase: ${client.name}`,
          });
        } else if (
          salespersonChanged &&
          !nextSalesperson &&
          prevSalesperson
        ) {
          // Salesperson cleared — drop sales rows for this client
          await prisma.salesPerformance.deleteMany({
            where: {
              periodId,
              clientName: client.name,
              employeeName: prevSalesperson,
            },
          });
          const { computeSalesPayroll } = await import(
            "@/lib/payroll-service"
          );
          const { syncPayrollForEmployee } = await import(
            "@/lib/links-service"
          );
          await computeSalesPayroll(periodId);
          await syncPayrollForEmployee(periodId, prevSalesperson);
        }
      } else if (tp > 0 || paid > 0) {
        await prisma.receivable.create({
          data: {
            periodId,
            clientId: id,
            clientName: client.name,
            salesperson: salesperson || null,
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

        if (salesperson && tp > 0) {
          await attributeSaleToSalesperson({
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

  await prisma.clientLedger.deleteMany({ where: { clientId: id } });
  await prisma.receivable.deleteMany({ where: { clientId: id } });
  await prisma.client.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
