import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { formatPKR } from "@/lib/utils";

export default async function CashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  let periods = await listPeriods();
  let periodId = params.period;
  if (!periodId || periods.length === 0) {
    const now = new Date();
    const c = await getOrCreatePeriod(now.getFullYear(), now.getMonth() + 1);
    periodId = c.id;
    periods = await listPeriods();
  }
  const current = periods.find((p) => p.id === periodId) ?? periods[0];

  const [banks, payroll, payables, hotels, transport, marketing, office, receivables] =
    await Promise.all([
      prisma.bankBalance.findMany(),
      prisma.payrollEntry.findMany({ where: { periodId: current.id, status: "Pending" } }),
      prisma.payable.findMany({ where: { periodId: current.id } }),
      prisma.hotelBooking.findMany({
        where: { periodId: current.id },
        include: { payable: true },
      }),
      prisma.transportJob.findMany({
        where: { periodId: current.id },
        include: { payable: true },
      }),
      prisma.marketingExpense.findMany({ where: { periodId: current.id } }),
      prisma.officeExpense.findMany({ where: { periodId: current.id } }),
      prisma.receivable.findMany({ where: { periodId: current.id, remainingAmount: { gt: 0 } } }),
    ]);

  const bankTotal = banks.reduce((s, b) => s + b.balance, 0);
  const expectedCollections = receivables.reduce((s, r) => s + r.remainingAmount, 0);
  const totalAvailable = bankTotal;
  const salariesDue = payroll.reduce((s, p) => s + p.netPayable, 0);
  const supplierDue = payables.reduce((s, p) => s + p.remaining, 0);
  const hotelDue = hotels.reduce((s, h) => s + (h.payable?.remaining ?? 0), 0);
  const driverDue = transport.reduce((s, t) => s + (t.payable?.remaining ?? 0), 0);
  const totalCommitted = salariesDue + supplierDue + hotelDue + driverDue;
  const freeCash = totalAvailable - totalCommitted;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Cash Flow Management</h1>
          <p className="text-sm text-slate-500">Available Cash − Committed Payments = Free Cash</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border p-5 space-y-2">
          <h2 className="font-semibold text-emerald-700">Money Available</h2>
          <Row label="Bank Balances" value={bankTotal} />
          <Row label="Petty Cash" value={0} />
          <Row label="Expected Collections" value={expectedCollections} />
          <div className="border-t pt-2">
            <Row label="TOTAL AVAILABLE" value={totalAvailable} bold />
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5 space-y-2">
          <h2 className="font-semibold text-red-700">Money Committed</h2>
          <Row label="Hotel Payments Due" value={hotelDue} />
          <Row label="Supplier Payments Due" value={supplierDue} />
          <Row label="Driver Payments Due" value={driverDue} />
          <Row label="Salaries Due" value={salariesDue} />
          <div className="border-t pt-2">
            <Row label="TOTAL COMMITTED" value={totalCommitted} bold />
          </div>
        </div>
        <div className="bg-white rounded-xl border p-5 space-y-2">
          <h2 className="font-semibold text-slate-800">Free Cash</h2>
          <p className={`text-3xl font-bold ${freeCash >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {formatPKR(freeCash)}
          </p>
          <p className="text-xs text-slate-500 mt-2">
            Update Receivables & Payables regularly. Management must always know Free Cash.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={`tabular-nums ${bold ? "font-bold" : ""}`}>{formatPKR(value)}</span>
    </div>
  );
}