import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

const ALLOWED = ["name", "role", "basicSalary", "phone", "isActive"] as const;

/**
 * Canonicalize role strings so case/spacing variants never break
 * Sales vs Other-Staff bucketing in Settings or Payroll.
 */
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

function pickEmployee(body: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const k of ALLOWED) {
    if (k in body) out[k] = body[k];
  }
  if (typeof out.name === "string") out.name = out.name.trim();

  // Always run role through canonicalize when present in the body
  if ("role" in body) {
    out.role = canonicalizeRole(body.role);
  }

  if (typeof out.phone === "string") {
    const p = out.phone.trim();
    out.phone = p === "" ? null : p;
  }
  if (typeof out.basicSalary === "string") {
    out.basicSalary = parseFloat(out.basicSalary) || 0;
  } else if (typeof out.basicSalary === "number") {
    out.basicSalary = Number.isFinite(out.basicSalary) ? out.basicSalary : 0;
  }
  if ("isActive" in out && out.isActive === undefined) out.isActive = true;
  return out;
}

/**
 * Sync the EmployeeLoan row when loan fields are present in the body.
 */
async function syncLoan(employeeId: string, body: Record<string, unknown>) {
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
    include: { loans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });

  return NextResponse.json(
    rows.map((e) => ({
      id: e.id,
      name: e.name,
      role: e.role,
      basicSalary: e.basicSalary,
      phone: e.phone,
      isActive: e.isActive,
      loanOriginal: e.loans[0]?.originalAmount ?? 0,
      loanRemaining: e.loans[0]?.remainingAmount ?? 0,
      loanInstallment: e.loans[0]?.monthlyInstallment ?? 0,
    }))
  );
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

    // Always persist a concrete role string — never null on create.
    data.role = (data.role as string | null) ?? "Sales";
    if (data.isActive == null) data.isActive = true;

    console.log("[employees:POST]", { name: data.name, role: data.role });

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

    // Only change role when the caller actually supplied a "role" key.
    if (!("role" in body)) {
      delete (data as Record<string, unknown>).role;
    } else {
      // Explicit role from client — never leave null if they sent a value.
      data.role = canonicalizeRole(body.role) ?? "Sales";
    }

    console.log("[employees:PUT]", {
      id,
      name: existing.name,
      bodyRole: body.role,
      dataRole: data.role,
    });

    // Safety: never quietly downgrade a sales role to "Staff"/empty if
    // they have commission history.
    const nextRole =
      typeof data.role === "string" ? (data.role as string).trim() : null;
    const isDowngradeToStaff =
      nextRole === null ||
      nextRole === "" ||
      nextRole.toLowerCase() === "staff";
    if (isDowngradeToStaff) {
      const hasCommission = await prisma.commission.findFirst({
        where: {
          employeeName: { equals: existing.name, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (hasCommission) {
        return NextResponse.json(
          {
            error:
              `${existing.name} has commission history and cannot be set to "Staff". ` +
              `Choose "Sales" or "Team Lead-Sales" instead.`,
          },
          { status: 400 }
        );
      }
    }

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

    await prisma.payrollEntry.deleteMany({ where: { employeeId: id } });
    await prisma.commission.deleteMany({ where: { employeeId: id } });
    await prisma.employeeLoan.deleteMany({ where: { employeeId: id } });
    await prisma.asset.updateMany({
      where: { assignedToId: id },
      data: { assignedToId: null },
    });

    await prisma.employee.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[employees:DELETE]", e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
