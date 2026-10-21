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

/**
 * Sync loan fields from the payroll edit form.
 *
 * CRITICAL RULES (this is the bug fix):
 *   1. The payroll form may change:
 *        - loanOriginal   (the total amount originally borrowed)
 *        - loanBalance    (the CURRENT total owed) — BUT only if it is
 *                          explicitly allowed to be edited
 *        - loanInstallment (the scheduled monthly amount for THIS month)
 *   2. The payroll form may NEVER silently move remainingAmount during
 *      a routine save (change status, change amountPaid, etc.). Doing so
 *      is what caused the 601,000 vs 631,000 drift for Mr Ahsaan.
 *   3. The ONLY sanctioned path for actually reducing remainingAmount is
 *      when the payroll row transitions to fully Paid (handled by
 *      applyPayrollPayment in links-service.ts and by the helper below).
 *
 * So this function now:
 *   - Reads the loan row
 *   - Applies an explicit, user-edited originalAmount (if changed)
 *   - Applies an explicit, user-edited monthlyInstallment (if changed)
 *   - Applies an explicit remainingAmount override (if the user typed a
 *     different number AND the loan is not currently being auto-deducted
 *     by a Paid transition in the same request)
 *   - Caps monthlyInstallment at remainingAmount
 *   - NEVER touches remainingAmount as a side effect of saving the row
 */
async function syncLoanFromEdit(opts: {
  periodId: string;
  employeeName: string;
  loanOriginal?: number | null;
  loanBalance?: number | null;
  loanInstallment?: number | null;
  /** True when this save is being used to mark the payroll fully paid. */
  markingPaid?: boolean;
}) {
  const {
    periodId,
    employeeName,
    loanOriginal,
    loanBalance,
    loanInstallment,
    markingPaid,
  } = opts;

  if (
    loanOriginal == null &&
    loanBalance == null &&
    loanInstallment == null
  ) {
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

  if (!existing) {
    // Create a new loan row only if user is entering a real balance
    if ((loanOriginal || 0) > 0 || (loanBalance || 0) > 0) {
      const orig = Number(loanOriginal) || Number(loanBalance) || 0;
      const rem = Math.min(orig, Number(loanBalance) || 0);
      const inst = Math.max(0, Number(loanInstallment) || 0);
      await prisma.employeeLoan.create({
        data: {
          employeeId: emp.id,
          originalAmount: orig,
          remainingAmount: rem,
          monthlyInstallment: Math.min(inst, rem),
          notes: "Created from payroll edit",
        },
      });
    }
    return;
  }

  // Build update object conservatively
  const update: {
    originalAmount?: number;
    remainingAmount?: number;
    monthlyInstallment?: number;
  } = {};

  // 1. Original amount: only change if the user typed a different, valid number
  if (loanOriginal != null && Number.isFinite(Number(loanOriginal))) {
    const nextOrig = Math.max(0, Number(loanOriginal));
    if (nextOrig !== existing.originalAmount) {
      update.originalAmount = nextOrig;
    }
  }

  // 2. Monthly installment: respect user's typed value, cap at remaining
  if (loanInstallment != null && Number.isFinite(Number(loanInstallment))) {
    const nextInst = Math.max(0, Number(loanInstallment));
    const remainingAfter = existing.remainingAmount;
    const capped = Math.min(nextInst, Math.max(0, remainingAfter));
    if (capped !== existing.monthlyInstallment) {
      update.monthlyInstallment = capped;
    }
  }

  // 3. Remaining amount: ONLY allow an explicit override when:
  //      - the user typed a different number, AND
  //      - we are not simultaneously marking the row Paid (that path
  //        already applied the installment in applyPayrollPayment).
  if (
    loanBalance != null &&
    Number.isFinite(Number(loanBalance)) &&
    !markingPaid
  ) {
    const nextBal = Math.max(0, Number(loanBalance));
    if (Math.abs(nextBal - existing.remainingAmount) > 0.5) {
      // Safety: don't let remaining exceed original
      const orig =
        update.originalAmount ?? existing.originalAmount ?? nextBal;
      update.remainingAmount = Math.min(orig, nextBal);
    }
  }

  if (Object.keys(update).length > 0) {
    await prisma.employeeLoan.update({
      where: { id: existing.id },
      data: update,
    });
  }
}

/**
 * Apply the loan deduction exactly once when a payroll row transitions
 * from not-Paid to Paid. This centralizes the ONLY sanctioned
 * remainingAmount decrement during the payroll lifecycle.
 *
 * Returns the new remaining balance (or null if no loan exists).
 */
async function applyLoanDeductionIfNowPaid(opts: {
  employeeId: string | null;
  employeeName: string;
  loanInstallment: number;
  previouslyPaid: boolean;
  nowPaid: boolean;
}): Promise<number | null> {
  const { employeeId, employeeName, loanInstallment, previouslyPaid, nowPaid } =
    opts;

  if (!nowPaid || previouslyPaid) return null; // only on the transition
  if (!employeeId && !employeeName) return null;
  if (loanInstallment <= 0) return null;

  const emp = employeeId
    ? await prisma.employee.findUnique({ where: { id: employeeId } })
    : await prisma.employee.findFirst({
        where: { name: { equals: employeeName, mode: "insensitive" } },
      });
  if (!emp) return null;

  const loan = await prisma.employeeLoan.findFirst({
    where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
    orderBy: { createdAt: "desc" },
  });
  if (!loan) return null;

  const deduction = Math.min(loanInstallment, loan.remainingAmount);
  const newRemaining = Math.max(0, loan.remainingAmount - deduction);

  // Next scheduled installment is capped at what's left
  const nextInstallment =
    newRemaining <= 0
      ? 0
      : Math.min(loan.monthlyInstallment || deduction, newRemaining);

  await prisma.employeeLoan.update({
    where: { id: loan.id },
    data: {
      remainingAmount: newRemaining,
      monthlyInstallment: nextInstallment,
    },
  });

  return newRemaining;
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

    // NEW rows: never touch remainingAmount of an existing loan. Only
    // set originalAmount / monthlyInstallment if user typed them.
    const loanOriginal =
      body.loanOriginal != null ? Number(body.loanOriginal) : null;
    const loanBalance =
      body.loanBalance != null ? Number(body.loanBalance) : null;
    const loanInstallment =
      data.loanInstallment != null ? Number(data.loanInstallment) : null;

    const row = await prisma.payrollEntry.create({ data: data as never });

    if (row.periodId && row.employeeName) {
      // Do NOT reduce remainingAmount on create. Only apply original +
      // monthly installment + explicit override.
      await syncLoanFromEdit({
        periodId: row.periodId,
        employeeName: row.employeeName,
        loanOriginal,
        loanBalance,
        loanInstallment,
        markingPaid: row.status === "Paid",
      });

      // If created as Paid (rare but possible), apply the installment once
      if (row.status === "Paid") {
        await applyLoanDeductionIfNowPaid({
          employeeId: row.employeeId,
          employeeName: row.employeeName,
          loanInstallment: row.loanInstallment ?? 0,
          previouslyPaid: false,
          nowPaid: true,
        });
      }
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
    // Never pass non-column keys to Prisma
    delete (data as Record<string, unknown>).team;
    delete (data as Record<string, unknown>).commissionAmt;
    delete (data as Record<string, unknown>).loanOriginal;
    delete (data as Record<string, unknown>).loanBalance;

    const nameForEmp = String(
      data.employeeName || old.employeeName || ""
    ).trim();

    let empRole: string | null = null;
    try {
      const emp = await ensureEmployeeFromTeam({
        employeeName: nameForEmp,
        team: body.team as string | null | undefined,
        basicSalary: data.basicSalary as number | undefined,
      });
      if (emp) {
        data.employeeId = emp.id;
        if (data.employeeName) data.employeeName = emp.name;
        empRole = emp.role;
      }
    } catch (syncErr) {
      console.error("[payroll:PUT] employee sync failed (continuing)", syncErr);
    }

    const row = await prisma.payrollEntry.update({
      where: { id },
      data: data as never,
    });

    const loanOriginal =
      body.loanOriginal != null ? Number(body.loanOriginal) : null;
    const loanBalance =
      body.loanBalance != null ? Number(body.loanBalance) : null;

    if (row.periodId && row.employeeName) {
      try {
        // CRITICAL: if the row just transitioned to Paid, deduct the loan
        // exactly ONCE via the dedicated helper. Only after that do we
        // sync any remaining fields from the form.
        const previouslyPaid = old.status === "Paid";
        const nowPaid = row.status === "Paid";

        if (!previouslyPaid && nowPaid) {
          await applyLoanDeductionIfNowPaid({
            employeeId: row.employeeId,
            employeeName: row.employeeName,
            loanInstallment: row.loanInstallment ?? old.loanInstallment ?? 0,
            previouslyPaid: false,
            nowPaid: true,
          });
        } else if (previouslyPaid && !nowPaid) {
          // Reverting a Paid row: add the installment back so numbers
          // stay consistent with what the user sees.
          const emp = row.employeeId
            ? await prisma.employee.findUnique({
                where: { id: row.employeeId },
              })
            : await prisma.employee.findFirst({
                where: { name: { equals: row.employeeName, mode: "insensitive" } },
              });
          if (emp) {
            const loan = await prisma.employeeLoan.findFirst({
              where: { employeeId: emp.id },
              orderBy: { createdAt: "desc" },
            });
            if (loan) {
              const addBack = Math.min(
                old.loanInstallment ?? 0,
                loan.originalAmount - loan.remainingAmount
              );
              if (addBack > 0) {
                await prisma.employeeLoan.update({
                  where: { id: loan.id },
                  data: {
                    remainingAmount: loan.remainingAmount + addBack,
                    monthlyInstallment: Math.min(
                      old.loanInstallment ?? loan.monthlyInstallment,
                      loan.remainingAmount + addBack
                    ),
                  },
                });
              }
            }
          }
        }

        // Now sync explicit form fields. Pass markingPaid so we don't
        // clobber remainingAmount that we just adjusted.
        await syncLoanFromEdit({
          periodId: row.periodId,
          employeeName: row.employeeName,
          loanOriginal,
          loanBalance,
          loanInstallment: data.loanInstallment as number | undefined,
          markingPaid: nowPaid,
        });
      } catch (loanErr) {
        console.error("[payroll:PUT] loan sync failed", loanErr);
      }
    }

    return NextResponse.json({
      ...row,
      team: empRole ?? body.team ?? null,
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

    const existing = await prisma.payrollEntry.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: true, alreadyGone: true });
    }

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