import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Create payroll rows for all active employees if missing for this period */
export async function POST(req: NextRequest) {
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

      const isLead = nameL.includes("amad") || nameL.includes("ammar");
      const basic = isLead ? 0 : emp.basicSalary || (emp.role === "Sales" ? 40000 : 0);
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
            emp.role === "Sales"
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
