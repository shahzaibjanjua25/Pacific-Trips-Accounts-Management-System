// pacific-trips-app/src/app/api/payroll/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

const ALLOWED_FIELDS = [
  "periodId",
  "employeeId",
  "employeeName",
  "basicSalary",
  "bonus",
  "taxDeducted",
  "loanInstallment",
  "otherDeductions",
  "netPayable",
  "amountPaid",
  "remaining",
  "status",
  "paidDate",
  "notes",
];

function canonicalizeRole(raw: unknown): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  if (!t) return null;
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

function pickAllowed(data: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_FIELDS) {
    if (key in data) out[key] = data[key];
  }
  return out;
}

function enrich(data: Record<string, unknown>) {
  const d = { ...data };
  const basic = Number(d.basicSalary) || 0;
  const bonus = Number(d.bonus) || 0;
  const tax = Number(d.taxDeducted) || 0;
  const loan = Number(d.loanInstallment) || 0;
  const other = Number(d.otherDeductions) || 0;
  const paid = Number(d.amountPaid) || 0;
  if (d.netPayable == null || d.netPayable === "") {
    d.netPayable = Math.max(0, basic + bonus - tax - loan - other);
  } else {
    d.netPayable = Number(d.netPayable) || 0;
  }
  d.remaining = Math.max(0, (d.netPayable as number) - paid);
  if ((d.remaining as number) === 0 && paid > 0) d.status = "Paid";
  else if (paid > 0) d.status = "Partial";
  else d.status = d.status || "Pending";

  for (const key of Object.keys(d)) {
    if (
      key.toLowerCase().includes("date") &&
      typeof d[key] === "string" &&
      d[key]
    ) {
      d[key] = new Date(d[key] as string);
    } else if (typeof d[key] === "string" && d[key] === "") {
      d[key] = null;
    }
  }
  return d;
}

/**
 * Find or create an Employee from the payroll form's name + Team field.
 * THIS is what drives Sales vs Other Staff on the payroll page —
 * PayrollEntry itself has no role column.
 */
async function ensureEmployeeFromTeam(opts: {
  employeeName: string;
  team?: string | null;
  basicSalary?: number | null;
}): Promise<{ id: string; name: string; role: string | null } | null> {
  const name = (opts.employeeName || "").trim();
  if (!name) return null;

  const role = canonicalizeRole(opts.team);
  const basic =
    opts.basicSalary != null && Number.isFinite(Number(opts.basicSalary))
      ? Number(opts.basicSalary)
      : undefined;

  let emp = await prisma.employee.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });

  if (!emp) {
    emp = await prisma.employee.create({
      data: {
        name,
        role: role ?? "Staff",
        basicSalary: basic ?? 0,
        isActive: true,
      },
    });
    console.log("[payroll] created Employee", {
      id: emp.id,
      name: emp.name,
      role: emp.role,
    });
    return emp;
  }

  // Update role when the form explicitly sent Team / Designation
  if (role) {
    const data: { role: string; basicSalary?: number; isActive?: boolean } = {
      role,
      isActive: true,
    };
    if (basic != null && basic > 0) data.basicSalary = basic;
    emp = await prisma.employee.update({
      where: { id: emp.id },
      data,
    });
    console.log("[payroll] updated Employee.role", {
      id: emp.id,
      name: emp.name,
      role: emp.role,
    });
  }

  return emp;
}

/** Sync loan fields (loanOriginal, loanBalance) to EmployeeLoan */
async function syncLoanFromEdit(
  periodId: string,
  employeeName: string,
  loanOriginal?: number | null,
  loanBalance?: number | null,
  loanInstallment?: number | null
) {
  if (loanOriginal == null && loanBalance == null && loanInstallment == null) {
    return;
  }

  const emp = await prisma.employee.findFirst({
    where: { name: { equals: employeeName, mode: "insensitive" } },
  });
  if (!emp) return;

  const existing = await prisma.employeeLoan.findFirst({
    where: { employeeId: emp.id },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const update: Record<string, number> = {};
    if (loanOriginal != null) update.originalAmount = Number(loanOriginal);
    if (loanBalance != null)
      update.remainingAmount = Math.max(0, Number(loanBalance));
    if (loanInstallment != null)
      update.monthlyInstallment = Math.max(0, Number(loanInstallment));
    if (Object.keys(update).length > 0) {
      await prisma.employeeLoan.update({
        where: { id: existing.id },
        data: update,
      });
    }
  } else if ((loanOriginal || 0) > 0 || (loanBalance || 0) > 0) {
    await prisma.employeeLoan.create({
      data: {
        employeeId: emp.id,
        originalAmount: Number(loanOriginal) || Number(loanBalance) || 0,
        remainingAmount: Number(loanBalance) || 0,
        monthlyInstallment: Number(loanInstallment) || 0,
        notes: "Created from payroll edit",
      },
    });
  }
}

export async function GET(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const periodId = req.nextUrl.searchParams.get("periodId");
  const where = periodId ? { periodId } : {};
  const rows = await prisma.payrollEntry.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const cleaned = pickAllowed(body);
    const data = enrich(cleaned);
    delete data.id;

    if (!data.employeeName || String(data.employeeName).trim() === "") {
      return NextResponse.json(
        { error: "employeeName required" },
        { status: 400 }
      );
    }

    // Sync Employee.role from the form's Team / Designation field
    const emp = await ensureEmployeeFromTeam({
      employeeName: String(data.employeeName),
      team: body.team as string | null | undefined,
      basicSalary: data.basicSalary as number | undefined,
    });
    if (emp) {
      data.employeeId = emp.id;
      data.employeeName = emp.name; // canonical casing from Employee row
    }

    const loanOriginal =
      body.loanOriginal != null ? Number(body.loanOriginal) : null;
    const loanBalance =
      body.loanBalance != null ? Number(body.loanBalance) : null;

    const row = await prisma.payrollEntry.create({ data: data as never });

    if (row.periodId && row.employeeName) {
      await syncLoanFromEdit(
        row.periodId,
        row.employeeName,
        loanOriginal,
        loanBalance,
        row.loanInstallment
      );
    }

    return NextResponse.json({
      ...row,
      team: emp?.role ?? body.team ?? null,
    });
  } catch (e) {
    console.error("[payroll:POST]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    if (!body.id)
      return NextResponse.json({ error: "id required" }, { status: 400 });
    const id = body.id as string;

    const old = await prisma.payrollEntry.findUnique({ where: { id } });
    if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const cleaned = pickAllowed(body);
    const data = enrich(cleaned);
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.periodId;

    const nameForEmp = String(
      data.employeeName || old.employeeName || ""
    ).trim();

    // Always honour Team field on edit so moving someone Sales ↔ Staff works
    const emp = await ensureEmployeeFromTeam({
      employeeName: nameForEmp,
      team: body.team as string | null | undefined,
      basicSalary: data.basicSalary as number | undefined,
    });
    if (emp) {
      data.employeeId = emp.id;
      if (data.employeeName) data.employeeName = emp.name;
    }

    const row = await prisma.payrollEntry.update({ where: { id }, data });

    const loanOriginal =
      body.loanOriginal != null ? Number(body.loanOriginal) : null;
    const loanBalance =
      body.loanBalance != null ? Number(body.loanBalance) : null;

    if (row.periodId && row.employeeName) {
      await syncLoanFromEdit(
        row.periodId,
        row.employeeName,
        loanOriginal,
        loanBalance,
        row.loanInstallment
      );
    }

    return NextResponse.json({
      ...row,
      team: emp?.role ?? body.team ?? null,
    });
  } catch (e) {
    console.error("[payroll:PUT]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    await prisma.transactionLink.deleteMany({
      where: { entityType: "payroll", entityId: id },
    });

    await prisma.payrollEntry.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[payroll:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
