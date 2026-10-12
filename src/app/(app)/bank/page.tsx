import { prisma } from "@/lib/prisma";
import { getOrCreatePeriod, listPeriods } from "@/lib/period";
import { PeriodSelector } from "@/components/PeriodSelector";
import { formatPKR } from "@/lib/utils";
import {
  BankAccountsPanel,
  type BankRow,
} from "@/components/BankAccountsPanel";

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

  const rows = await prisma.bankBalance.findMany({
    orderBy: { accountName: "asc" },
  });

  let bankTxns: {
    id: string;
    date: Date;
    accountName: string;
    description: string | null;
    deposit: number;
    withdrawal: number;
    transferIn: number;
    transferOut: number;
    balance: number;
  }[] = [];
  try {
    bankTxns = await prisma.bankTxn.findMany({
      where: { periodId: current.id },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 200,
    });
  } catch {
    bankTxns = [];
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Bank Accounts</h1>
          <p className="text-sm text-slate-500">
            Manage account balances (Add / Edit / Delete). Completed transactions and bank
            transfers update balances automatically. Pending does not.
          </p>
        </div>
        <PeriodSelector periods={periods} currentId={current.id} />
      </div>

      <BankAccountsPanel
        periodId={current.id}
        initialRows={rows as unknown as BankRow[]}
      />

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h2 className="font-semibold text-slate-800">
            Bank movements — {current.label}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            History from Completed transactions. Use category{" "}
            <strong>Bank Transfer</strong> on Transactions (Account = From, Party = To).
            To change a transfer, edit or delete it on the Transactions page.
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
