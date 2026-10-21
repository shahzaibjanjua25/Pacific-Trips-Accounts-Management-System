import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

function canonicalizeRole(raw: unknown): string {
  if (raw == null) return "Sales";
  const t = String(raw).trim();
  if (!t) return "Sales";
  const lower = t.toLowerCase();
  if (lower === "sales" || lower === "sale") return "Sales";
  if (
    lower === "team lead-sales" ||
    lower === "team lead sales" ||
    lower === "teamlead-sales" ||
    lower === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  return t;
}

function num(v: unknown, fallback = 0): number {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Case-insensitive employee lookup; create Sales employee if missing. */
async function findOrCreateEmployee(employeeName: string, role?: string | null) {
  const name = employeeName.trim();
  if (!name) return null;

  let emp = await prisma.employee.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });

  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        name,
        role: canonicalizeRole(role ?? "Sales"),
        basicSalary: 40000,
        isActive: true,
      },
    });
  }

  return emp;
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      periodId,
      employeeName,
      role,
      basicSalary,
      individualSales,
      saleBase,
      commissionRate,
      commissionAmt,
      netPayable,
      amountPaid,
      remaining,
      status,
      notes,
    } = body;

    if (!periodId || !employeeName) {
      return NextResponse.json(
        { error: "periodId and employeeName required" },
        { status: 400 }
      );
    }

    const emp = await findOrCreateEmployee(String(employeeName), role);
    if (!emp) {
      return NextResponse.json(
        { error: "Employee name required" },
        { status: 400 }
      );
    }

    const nextRole = canonicalizeRole(role ?? emp.role ?? "Sales");
    const isLead = nextRole === "Team Lead-Sales";

    await prisma.employee.update({
      where: { id: emp.id },
      data: {
        role: nextRole,
        isActive: true,
        ...(basicSalary != null && basicSalary !== ""
          ? { basicSalary: num(basicSalary, emp.basicSalary) }
          : {}),
      },
    });

    // Non-lead: prefer individualSales (what the form labels "Individual Sales").
    // Lead: prefer saleBase (team sales). Previously saleBase was ALWAYS sent and
    // won, so editing Individual Sales never stuck.
    const saleAmt = isLead
      ? num(
          saleBase != null && saleBase !== "" ? saleBase : individualSales,
          0
        )
      : num(
          individualSales != null && individualSales !== ""
            ? individualSales
            : saleBase,
          0
        );

    const rate =
      commissionRate != null && commissionRate !== ""
        ? num(commissionRate, 2.5)
        : 2.5;

    const commAmt =
      commissionAmt != null && commissionAmt !== ""
        ? num(commissionAmt, 0)
        : saleAmt * (rate / 100);

    const existingComm = await prisma.commission.findFirst({
      where: {
        periodId,
        OR: [
          { employeeName: emp.name },
          { employeeName: { equals: emp.name, mode: "insensitive" } },
          { employeeId: emp.id },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingComm) {
      await prisma.commission.update({
        where: { id: existingComm.id },
        data: {
          employeeId: emp.id,
          employeeName: emp.name,
          saleAmount: saleAmt,
          commissionRate: rate,
          commissionAmt: commAmt,
          status: status === "Paid" ? "Paid" : "Accrued",
          notes: notes != null ? String(notes) : existingComm.notes,
        },
      });
    } else {
      await prisma.commission.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          saleAmount: saleAmt,
          commissionRate: rate,
          commissionAmt: commAmt,
          status: status === "Paid" ? "Paid" : "Accrued",
          notes: notes ? String(notes) : null,
        },
      });
    }

    const existingPay = await prisma.payrollEntry.findFirst({
      where: {
        periodId,
        OR: [
          { employeeName: emp.name },
          { employeeName: { equals: emp.name, mode: "insensitive" } },
          { employeeId: emp.id },
        ],
      },
      orderBy: { createdAt: "desc" },
    });

    const basic =
      basicSalary != null && basicSalary !== ""
        ? num(basicSalary, 0)
        : existingPay?.basicSalary ?? emp.basicSalary ?? 0;
    const loan = existingPay?.loanInstallment ?? 0;
    const tax = existingPay?.taxDeducted ?? 0;
    const other = existingPay?.otherDeductions ?? 0;

    const computedNet = Math.max(0, basic + commAmt - tax - loan - other);
    const net =
      netPayable != null && netPayable !== ""
        ? num(netPayable, computedNet)
        : computedNet;

    const paid =
      amountPaid != null && amountPaid !== ""
        ? num(amountPaid, 0)
        : existingPay?.amountPaid ?? 0;

    const rem =
      remaining != null && remaining !== ""
        ? Math.max(0, num(remaining, 0))
        : Math.max(0, net - paid);

    let nextStatus: string;
    if (status) nextStatus = String(status);
    else if (rem <= 0 && paid > 0) nextStatus = "Paid";
    else if (paid > 0) nextStatus = "Partial";
    else nextStatus = "Pending";

    if (existingPay) {
      await prisma.payrollEntry.update({
        where: { id: existingPay.id },
        data: {
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary: basic,
          netPayable: net,
          amountPaid: paid,
          remaining: rem,
          status: nextStatus,
          notes:
            notes != null ? String(notes) : existingPay.notes,
        },
      });
    } else {
      await prisma.payrollEntry.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary: basic,
          loanInstallment: loan,
          taxDeducted: tax,
          otherDeductions: other,
          netPayable: net,
          amountPaid: paid,
          remaining: rem,
          status: nextStatus,
          notes: notes ? String(notes) : null,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      employeeId: emp.id,
      role: nextRole,
      saleAmount: saleAmt,
      commissionAmt: commAmt,
      netPayable: net,
      amountPaid: paid,
      remaining: rem,
      status: nextStatus,
    });
  } catch (e) {
    console.error("[sales-team:update POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const periodId = req.nextUrl.searchParams.get("periodId");
    const employeeName = req.nextUrl.searchParams.get("employeeName");
    const demote = req.nextUrl.searchParams.get("demoteFromSales") !== "0";

    if (!periodId || !employeeName) {
      return NextResponse.json(
        { error: "periodId and employeeName required" },
        { status: 400 }
      );
    }

    const name = employeeName.trim();

    const pays = await prisma.payrollEntry.findMany({
      where: {
        periodId,
        employeeName: { equals: name, mode: "insensitive" },
      },
    });
    if (pays.length > 0) {
      await prisma.transactionLink.deleteMany({
        where: {
          entityType: "payroll",
          entityId: { in: pays.map((p) => p.id) },
        },
      });
    }

    await prisma.commission.deleteMany({
      where: {
        periodId,
        employeeName: { equals: name, mode: "insensitive" },
      },
    });
    await prisma.payrollEntry.deleteMany({
      where: {
        periodId,
        employeeName: { equals: name, mode: "insensitive" },
      },
    });

    if (demote) {
      await prisma.employee.updateMany({
        where: {
          name: { equals: name, mode: "insensitive" },
          role: { in: ["Sales", "Team Lead-Sales"] },
        },
        data: { role: "Staff" },
      });
    }

    return NextResponse.json({ ok: true, demoted: demote });
  } catch (e) {
    console.error("[sales-team:update DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
