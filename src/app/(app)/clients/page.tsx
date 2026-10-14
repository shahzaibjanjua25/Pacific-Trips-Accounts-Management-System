import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { ClientsTable } from "./ClientsTable";

export default async function ClientsPage({
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

  const clients = await prisma.client.findMany({ orderBy: { name: "asc" } });
  const receivables = await prisma.receivable.findMany({
    where: { periodId: current.id },
  });
  const ledgers = await prisma.clientLedger.findMany();

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

    // Pick the most-recently-updated receivable as the "primary" for edit
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
      salesperson = recv.find((r) => r.salesperson)?.salesperson || null;
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Clients</h1>
          <p className="text-sm text-slate-500">
            Click a client to open their individual ledger, or edit any field
            inline.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <ClientsTable rows={rows} periodId={current.id} />
    </div>
  );
}