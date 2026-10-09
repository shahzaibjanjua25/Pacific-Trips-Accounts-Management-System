import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { DataTable } from "@/components/DataTable";
import { formatPKR } from "@/lib/utils";


export default async function ReceivablesPage({
  searchParams,
}: { searchParams: Promise<{ period?: string }> }) {
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
  const rows = await prisma.receivable.findMany({
    where: { periodId: current.id },
    orderBy: { bookingDate: "desc" },
  });
  const totalOutstanding = rows.reduce((s, r) => s + r.remainingAmount, 0);
  const overdue = rows.filter((r) => r.daysOverdue > 0).reduce((s, r) => s + r.remainingAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Client Receivables</h1>
          <p className="text-sm text-slate-500">Track every client: Total Sale → Received → Outstanding → Settlement</p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="bg-slate-100 px-3 py-1.5 rounded-md">Total Outstanding: <strong className="text-red-600">{formatPKR(totalOutstanding)}</strong></span>
        <span className="bg-slate-100 px-3 py-1.5 rounded-md">Overdue: <strong className="text-red-600">{formatPKR(overdue)}</strong></span>
        <span className="bg-slate-100 px-3 py-1.5 rounded-md">Open Clients: <strong>{rows.filter(r => r.status !== "Settled").length}</strong></span>
      </div>
      <DataTable
        columns={[
          { key: "clientName", header: "Client" },
          { key: "contact", header: "Contact" },
          { key: "bookingDate", header: "Booking Date", render: (r) => r.bookingDate ? new Date(r.bookingDate as string).toLocaleDateString("en-GB") : "—" },
          { key: "tripDates", header: "Trip Dates" },
          { key: "destination", header: "Destination" },
          { key: "totalPackage", header: "Total Package", money: true },
          { key: "amountReceived", header: "Received", money: true },
          { key: "remainingAmount", header: "Remaining", money: true },
          { key: "status", header: "Status" },
          { key: "salesperson", header: "Salesperson" },
        ]}
        data={rows as unknown as Record<string, unknown>[]}
      />
    </div>
  );
}
