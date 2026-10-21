import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

const ALLOWED = ["name", "role", "basicSalary", "phone", "isActive"] as const;

function pickEmployee(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) out[k] = body[k];
  }
  if (typeof out.name === "string") out.name = out.name.trim();
  if (typeof out.role === "string") {
    const r = out.role.trim();
    out.role = r === "" ? null : r;
  }
  if (typeof out.phone === "string") {
    const p = out.phone.trim();
    out.phone = p === "" ? null : p;
  }
  if (typeof out.basicSalary === "string") {
    out.basicSalary = parseFloat(out.basicSalary) || 0;
  }
  if ("isActive" in out && out.isActive === undefined) out.isActive = true;
  return out;
}

/**
 * Upsert the EmployeeLoan row for the given employee when any of the three
 * loan fields is present in the request body.
 *
 * Rules:
 *  - loanOriginal / loanRemaining / loanInstallment all default to keeping
 *    the existing value when the field is absent.
 *  - If all three net to 0 AND no loan exists, do nothing.
 *  - If all three net to 0 AND a loan exists, delete the loan.
 */
async function syncLoan(
  employeeId: string,
  body: Record<string, unknown>
) {
  const hasAny =
    "loanOriginal" in body ||
    "loanRemaining" in body ||
    "loanInstallment" in body;
  if (!hasAny) return;

  const parse = (v: unknown): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, n) : undefined;
  };

  const orig = parse(body.loanOriginal);
  const rem = parse(body.loanRemaining);
  const inst = parse(body.loanInstallment);

  const existing = await prisma.employeeLoan.findFirst({
    where: { employeeId },
    orderBy: { createdAt: "desc" },
  });

  const allZero =
    (orig ?? existing?.originalAmount ?? 0) === 0 &&
    (rem ?? existing?.remainingAmount ?? 0) === 0 &&
    (inst ?? existing?.monthlyInstallment ?? 0) === 0;

  if (allZero) {
    if (existing) {
      await prisma.employeeLoan.delete({ where: { id: existing.id } });
    }
    return;
  }

  if (existing) {
    await prisma.employeeLoan.update({
      where: { id: existing.id },
      data: {
        originalAmount: orig ?? existing.originalAmount,
        remainingAmount: rem ?? existing.remainingAmount,
        monthlyInstallment: inst ?? existing.monthlyInstallment,
      },
    });
  } else {
    await prisma.employeeLoan.create({
      data: {
        employeeId,
        originalAmount: orig ?? rem ?? 0,
        remainingAmount: rem ?? 0,
        monthlyInstallment: inst ?? 0,
        notes: "Created from Settings page",
      },
    });
  }
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.employee.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const data = pickEmployee(body);
    if (!data.name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    // Only default when the caller sent literally nothing — otherwise
    // respect whatever role the form submitted (including Team Lead-Sales).
    if (data.role == null) data.role = "Sales";
    if (data.isActive == null) data.isActive = true;

    const row = await prisma.employee.create({ data: data as never });
    await syncLoan(row.id, body);
    return NextResponse.json(row);
  } catch (e) {
    console.error("[employees:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const id = body.id as string;

    const existing = await prisma.employee.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const data = pickEmployee(body);
    delete (data as Record<string, unknown>).id;
    // If the caller left role out, keep what's there. If they explicitly
    // sent null, set it to null (user cleared the field).
    if (!("role" in body)) delete (data as Record<string, unknown>).role;

    const row = await prisma.employee.update({
      where: { id },
      data: data as never,
    });

    await syncLoan(id, body);

    return NextResponse.json(row);
  } catch (e) {
    console.error("[employees:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const emp = await prisma.employee.findUnique({ where: { id } });
    if (!emp) return NextResponse.json({ ok: true, alreadyGone: true });

    // 1. Detach any transaction links tied to this employee's payroll rows
    const payrollRows = await prisma.payrollEntry.findMany({
      where: { employeeId: id },
      select: { id: true },
    });
    if (payrollRows.length > 0) {
      await prisma.transactionLink.deleteMany({
        where: {
          entityType: "payroll",
          entityId: { in: payrollRows.map((p) => p.id) },
        },
      });
    }

    // 2. Remove payroll / commission / loan / asset assignments
    await prisma.payrollEntry.deleteMany({ where: { employeeId: id } });
    await prisma.commission.deleteMany({ where: { employeeId: id } });
    await prisma.employeeLoan.deleteMany({ where: { employeeId: id } });
    await prisma.asset.updateMany({
      where: { assignedToId: id },
      data: { assignedToId: null },
    });

    // 3. Delete the employee
    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[employees:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}