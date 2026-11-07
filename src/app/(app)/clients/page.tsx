import { clientReceiptGroups } from "@/lib/client-receipts";
import { NoAccountingMonth } from "@/components/NoAccountingMonth";
import { prisma } from "@/lib/prisma";
import { resolveActivePeriod } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ClientsTable } from "./ClientsTable";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const { periods, current } = await resolveActivePeriod(params.period);
  if (!current) return <NoAccountingMonth />;

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const receivables = await prisma.receivable.findMany({
    where: { periodId: current.id },
  });
  const ledgers = await prisma.clientLedger.findMany();

  // Fetch transactions that carry a bank account, so we can derive the
  // bank/cash account for each client by looking at their most recent receipt.
  const clientTxns = await prisma.transaction.findMany({
    where: { periodId: current.id, bankAccount: { not: null } },
    orderBy: { date: "desc" },
    select: {
      party: true,
      subCategory: true,
      bankAccount: true,
      date: true,
      category: true,
    },
  });

  type Row = {
    id: string;
    name: string;
    phone: string | null;
    contact: string | null;
    email: string | null;
    notes: string | null;
    totalPackage: number;
    amountPaid: number;
    amountDue: number;
    status: string;
    tripInfo: string;
    salesperson: string | null;
    bankAccount: string | null; // NEW
    bookingDate: string | null;
    dueDate: string | null;
    tripStart: string | null;
    tripDates: string | null;
    destination: string | null;
    discounts: number;
    additionalCharges: number;
    finalSettlement: number | null;
    receivableNotes: string | null;
  };

  const toISO = (d: Date | null | undefined) =>
    d ? new Date(d).toISOString() : null;

  /** Find the most recent bank account used for this client's receipts */
  function bankAccountForClient(clientName: string): string | null {
    const match = clientTxns.find(
      (t) => t.party === clientName || t.subCategory === clientName
    );
    return match?.bankAccount ?? null;
  }

  const rows: Row[] = clients.map((c) => {
    const recv = receivables.filter(
      (r) => r.clientId === c.id || r.clientName === c.name
    );
    const ledger = ledgers.filter((l) => l.clientId === c.id);

    let totalPackage = 0;
    let amountPaid = 0;
    let amountDue = 0;
    let tripInfo = "-";
    let status = "-";
    let salesperson: string | null = null;

    const primary =
      recv.slice().sort((a, b) => {
        const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bt - at;
      })[0] ?? null;

    let bookingDate: string | null = null;
    let dueDate: string | null = null;
    let tripStart: string | null = null;
    let tripDates: string | null = null;
    let destination: string | null = null;
    let discounts = 0;
    let additionalCharges = 0;
    let finalSettlement: number | null = null;
    let receivableNotes: string | null = null;

    if (recv.length > 0) {
      totalPackage = recv.reduce((s, r) => s + r.totalPackage, 0);
      amountPaid = recv.reduce((s, r) => s + r.amountReceived, 0);
      amountDue = recv.reduce((s, r) => s + r.remainingAmount, 0);
      tripInfo =
        recv.find((r) => r.tripDates)?.tripDates ||
        recv.find((r) => r.destination)?.destination ||
        "-";

      const mostRecentWithSalesperson = recv
        .slice()
        .sort((a, b) => {
          const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bt - at;
        })
        .find((r) => r.salesperson);
      salesperson = mostRecentWithSalesperson?.salesperson || null;

      status =
        amountDue <= 0 && amountPaid > 0
          ? "Settled"
          : amountPaid > 0
            ? "Partial"
            : "Open";

      if (primary) {
        bookingDate = toISO(primary.bookingDate);
        dueDate = toISO(primary.dueDate);
        tripStart = toISO(primary.tripStart);
        tripDates = primary.tripDates ?? null;
        destination = primary.destination ?? null;
        discounts = primary.discounts ?? 0;
        additionalCharges = primary.additionalCharges ?? 0;
        finalSettlement = primary.finalSettlement ?? null;
        receivableNotes = primary.notes ?? null;
      }
    } else if (ledger.length > 0) {
      const paidRows = ledger.filter(
        (l) =>
          l.hotel === "Payment" ||
          (l.category || "").toLowerCase().includes("receipt") ||
          (l.category || "").toLowerCase().includes("revenue")
      );
      const dueRows = ledger.filter(
        (l) =>
          l.hotel === "Receivables" ||
          (l.category || "").toLowerCase().includes("receivable")
      );
      amountPaid = paidRows.reduce((s, l) => s + (l.debit || 0), 0);
      amountDue = dueRows.reduce((s, l) => s + (l.debit || 0), 0);
      totalPackage = amountPaid + amountDue;
      tripInfo =
        ledger.find((l) => l.description)?.description ||
        ledger.find((l) => l.hotel)?.hotel ||
        "-";
      status =
        amountDue <= 0 && amountPaid > 0
          ? "Settled"
          : amountPaid > 0
            ? "Partial"
            : "Open";
    }

    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      contact: c.contact,
      email: c.email,
      notes: c.notes,
      totalPackage,
      amountPaid,
      amountDue,
      status,
      tripInfo,
      salesperson,
      bankAccount: bankAccountForClient(c.name),
      bookingDate,
      dueDate,
      tripStart,
      tripDates,
      destination,
      discounts,
      additionalCharges,
      finalSettlement,
      receivableNotes,
    };
  });

  // Receivable-only clients (no Client master row)
  for (const r of receivables) {
    if (r.clientId) continue;
    if (clients.some((c) => c.name === r.clientName)) continue;
    if (rows.some((x) => x.name === r.clientName)) continue;
    rows.push({
      id: `recv-${r.id}`,
      name: r.clientName,
      phone: r.contact,
      contact: r.contact,
      email: null,
      notes: null,
      totalPackage: r.totalPackage,
      amountPaid: r.amountReceived,
      amountDue: r.remainingAmount,
      status: r.status || "Open",
      tripInfo: r.tripDates || r.destination || "-",
      salesperson: r.salesperson || null,
      bankAccount: bankAccountForClient(r.clientName),
      bookingDate: toISO(r.bookingDate),
      dueDate: toISO(r.dueDate),
      tripStart: toISO(r.tripStart),
      tripDates: r.tripDates ?? null,
      destination: r.destination ?? null,
      discounts: r.discounts ?? 0,
      additionalCharges: r.additionalCharges ?? 0,
      finalSettlement: r.finalSettlement ?? null,
      receivableNotes: r.notes ?? null,
    });
  }

  const receiptGroups = await clientReceiptGroups(current.id);
  for (const group of receiptGroups.values()) {
    if (rows.some((row) => row.name === group.name)) continue;
    rows.push({
      id: "recv-" + group.id, name: group.name,
      phone: null, contact: null, email: null, notes: null,
      totalPackage: group.totalPackage, amountPaid: group.amountPaid, amountDue: group.amountDue,
      status: group.completed ? "Completed" : group.amountPaid > 0 ? "Partial" : "Open",
      tripInfo: "-", salesperson: null, bankAccount: null,
      bookingDate: null, dueDate: null, tripStart: null, tripDates: null, destination: null,
      discounts: 0, additionalCharges: 0, finalSettlement: null, receivableNotes: null,
    });
  }
  const classified = rows.map((row) => {
    const group = receiptGroups.get(row.name);
    return {
      ...row,
      totalPackage: group?.totalPackage ?? row.totalPackage,
      amountPaid: group?.amountPaid ?? row.amountPaid,
      amountDue: group?.amountDue ?? row.amountDue,
      status: group?.reopened ? "Reopened" : group?.completed ? "Completed" :
        group && group.amountDue > 0 ? (group.amountPaid > 0 ? "Partial" : "Open") : row.status,
      receiptCompleted: group?.completed ?? false,
      receiptReopened: group?.reopened ?? false,
      hasCurrentReceivable: receivables.some((invoice) =>
        invoice.clientId === row.id || invoice.clientName === row.name),
    };
  });
  const ongoing = classified.filter((row) => !row.receiptCompleted);
  const completed = classified.filter((row) => row.receiptCompleted);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-slate-500">
            Click a client to open their individual ledger, or edit any field
            inline. Salesperson shows who closed the sale.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <section className="space-y-3" aria-labelledby="ongoing-clients">
        <div>
          <h2 id="ongoing-clients" className="text-lg font-semibold text-slate-900">Ongoing clients ({ongoing.length})</h2>
          <p className="text-sm text-slate-600">Available for client receipts in this accounting month.</p>
        </div>
        <ClientsTable rows={ongoing} periodId={current.id} />
      </section>
      <section className="space-y-3" aria-labelledby="completed-clients">
        <div>
          <h2 id="completed-clients" className="text-lg font-semibold text-slate-900">Completed clients ({completed.length})</h2>
          <p className="text-sm text-slate-600">Fully paid clients. Restore a client to ongoing when you need them in the receipt form again.</p>
        </div>
        <ClientsTable rows={completed} periodId={current.id} completedView />
      </section>
    </div>
  );
}
