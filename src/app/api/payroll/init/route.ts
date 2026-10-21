import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/auth";

/**
 * Normalize a role string so any case variant of "sales" or
 * "team lead-sales" is treated as the canonical form.
 */
function normalizeRole(role: string | null | undefined): string {
  if (!role) return "Staff";
  const r = role.trim();
  const lower = r.toLowerCase();
  if (lower === "sales") return "Sales";
  if (
    lower === "team lead-sales" ||
    lower === "team lead sales" ||
    lower === "teamlead-sales" ||
    lower === "team-lead-sales"
  ) {
    return "Team Lead-Sales";
  }
  return r;
}

function isLeadName(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("ahmad") || n.includes("amad") || n.includes("ammar");
}

export async function POST(req: NextRequest) {
  const uid = await getSessionUserId();
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { periodId } = await req.json();
    if (!periodId) return NextResponse.json({ error: "periodId required" }, { status: 400 });

    const employees = await prisma.employee.findMany({ where: { isActive: true } });
    const existing = await prisma.payrollEntry.findMany({ where: { periodId } });
    const have = new Set(existing.map((e) => e.employeeName));

    const LOAN_INSTALL: Record<string, number> = {
      ahsaan: 30000,
      amad: 20000,
      ammar: 20000,
      awais: 20000,
    };

    let created = 0;
    for (const emp of employees) {
      if (have.has(emp.name)) continue;
      const nameL = emp.name.toLowerCase();
      let installment = 0;
      for (const [k, v] of Object.entries(LOAN_INSTALL)) {
        if (nameL.includes(k)) {
          installment = v;
          break;
        }
      }
      const loan = await prisma.employeeLoan.findFirst({
        where: { employeeId: emp.id, remainingAmount: { gt: 0 } },
      });
      if (loan && installment === 0) installment = loan.monthlyInstallment;

      const roleNorm = normalizeRole(emp.role);
      const isSales = roleNorm === "Sales" || roleNorm === "Team Lead-Sales";
      const isLead = roleNorm === "Team Lead-Sales" || isLeadName(emp.name);

      // Sales person (not lead) gets 40k default if salary wasn't set.
      // Team Lead gets 0 basic (their pay comes from commission).
      const basic = isLead
        ? 0
        : emp.basicSalary || (isSales ? 40000 : 0);
      const net = Math.max(0, basic - installment);

      await prisma.payrollEntry.create({
        data: {
          periodId,
          employeeId: emp.id,
          employeeName: emp.name,
          basicSalary: basic,
          loanInstallment: installment,
          netPayable: net,
          status: "Pending",
          notes:
            isSales
              ? isLead
                ? "Team Lead — commission via Compute button"
                : "Sales — commission via Compute button"
              : "Non-sales — no commission",
        },
      });
      created++;
    }

    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}