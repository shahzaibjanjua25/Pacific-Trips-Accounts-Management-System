import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatPKR } from "@/lib/utils";
import { ClientLedgerPanel } from "./ClientLedgerPanel";
import { ArrowLeft } from "lucide-react";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;

  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const [ledger, receivables, trips] = await Promise.all([
    prisma.clientLedger.findMany({
      where: { clientId: id },
      orderBy: [{ tourDate: "asc" }, { createdAt: "asc" }],
    }),
    prisma.receivable.findMany({
      where: {
        OR: [{ clientId: id }, { clientName: client.name }],
      },
    }),
    prisma.trip.findMany({ where: { clientName: client.name } }),
  ]);

  const totalDebit = ledger.reduce((s, l) => s + l.debit, 0);
  const totalCredit = ledger.reduce((s, l) => s + l.credit, 0);
  const balance = totalDebit - totalCredit;
  const amountPaid = receivables.reduce((s, r) => s + r.amountReceived, 0) || totalDebit;
  const amountDue = receivables.reduce((s, r) => s + r.remainingAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Link
          href={`/clients${sp.period ? `?period=${sp.period}` : ""}`}
          className="mt-1 p-2 rounded-lg hover:bg-slate-100 text-slate-600"
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{client.name}</h1>
          <p className="text-sm text-slate-500">
            {[client.phone, client.contact, client.email].filter(Boolean).join(" · ") ||
              "No contact details"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Amount Paid</p>
          <p className="text-lg font-bold text-emerald-700">{formatPKR(amountPaid)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Amount Due</p>
          <p className={`text-lg font-bold ${amountDue > 0 ? "text-red-600" : "text-slate-700"}`}>
            {formatPKR(amountDue)}
          </p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Ledger Balance (D−C)</p>
          <p className="text-lg font-bold">{formatPKR(balance)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-xs text-slate-500">Trips</p>
          <p className="text-sm font-medium">
            {trips.length
              ? trips.map((t) => `${t.destination || "Trip"} (${t.status})`).join(", ")
              : "—"}
          </p>
        </div>
      </div>

      <ClientLedgerPanel
        clientId={client.id}
        clientName={client.name}
        rows={ledger as unknown as Parameters<typeof ClientLedgerPanel>[0]["rows"]}
      />
    </div>
  );
}
