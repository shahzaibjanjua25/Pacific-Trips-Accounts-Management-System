import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { CrudPanel, type FieldDef } from "@/components/CrudPanel";
import { formatPKR } from "@/lib/utils";

const fields: FieldDef[] = [
  { key: "accountName", label: "Account Name", required: true },
  { key: "balance", label: "Balance (PKR)", type: "number" as const, required: true, money: true },
];

export default async function Page({
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

  const [rows, bankTxns] = await Promise.all([
    prisma.bankBalance.findMany({
      orderBy: { accountName: "asc" },
    }),
    prisma.bankTxn.findMany({
      where: { periodId: current.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
          <p className="text-sm text-slate-500">
            Account balances. Updated when you post <strong>Completed</strong> transactions
            (including Bank Transfers). Pending payments do not change balances.
            You can also set balances manually to match the bank statement.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <CrudPanel
        title="Bank Accounts"
        apiPath="/api/bank"
        periodId={current.id}
        fields={fields}
        rows={rows as unknown as (Record<string, unknown> & { id: string })[]}
      />

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-800">
            Bank movements — {current.label}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Deposits, withdrawals, and transfers recorded from Completed transactions.
            Use category <strong>Bank Transfer</strong> on the Transactions page
            (Account = From, Party = To).
          </p>
        </div>
        {bankTxns.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No bank movements in this period yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {[
                    "Date",
                    "Account",
                    "Description",
                    "Deposit",
                    "Withdrawal",
                    "Transfer In",
                    "Transfer Out",
                    "Balance after",
                  ].map((h) => (
                    <th
                      key={h}
                      className="px-3 py-2.5 text-left text-xs font-semibold text-slate-600 uppercase whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bankTxns.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-3 py-2">{t.accountName}</td>
                    <td className="px-3 py-2 max-w-[220px] truncate">
                      {t.description || "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {t.deposit ? formatPKR(t.deposit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">
                      {t.withdrawal ? formatPKR(t.withdrawal) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                      {t.transferIn ? formatPKR(t.transferIn) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-red-700">
                      {t.transferOut ? formatPKR(t.transferOut) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPKR(t.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
