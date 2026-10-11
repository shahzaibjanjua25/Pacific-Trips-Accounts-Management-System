"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2, Plus, X } from "lucide-react";
import { formatPKR } from "@/lib/utils";

type Txn = {
  id: string;
  date: string;
  description: string;
  category: string;
  subCategory?: string | null;
  party?: string | null;
  tripRef?: string | null;
  debit: number;
  credit: number;
  paymentMethod?: string | null;
  bankAccount?: string | null;
  status: string;
  enteredBy?: string | null;
  notes?: string | null;
};

type Option = { label: string; value: string; remaining: number; id?: string };
type Account = { id: string; name: string; balance: number };
type Outstanding = { value: number | null; exists: boolean; reason?: string } | null;

const CATEGORIES = [
  "Client Receipt",
  "Revenue",
  "Supplier Payment",
  "Hotel Payment",
  "Transport Payment",
  "Ticketing Payment",
  "Salary Payment",
  "Commission Payment",
  "Refund to Client",
  "Supplier Advance",
  "Employee Loan",
  "Office Expense",
  "Marketing Expense",
  "Owner Capital",
  "Owner Withdrawal",
  "Bank Transfer",
  "Other",
];

// ── Categories where money leaves US ──
const OUTBOUND_CHECK_CATEGORIES = [
  "Salary Payment",
  "Hotel Payment",
  "Supplier Payment",
  "Transport Payment",
  "Ticketing Payment",
  "Commission Payment",
  "Refund to Client",
  "Supplier Advance",
  "Employee Loan",
];

// Categories where money comes IN (client side)
const INBOUND_CATEGORIES = ["Client Receipt", "Revenue"];

const FALLBACK_ACCOUNTS: Account[] = [
  { id: "fallback-ubl", name: "UBL", balance: 0 },
  { id: "fallback-faysal", name: "Faysal Bank", balance: 0 },
  { id: "fallback-meezan", name: "Meezan Bank", balance: 0 },
  { id: "fallback-easypaisa", name: "Easypaisa", balance: 0 },
  { id: "fallback-jazzcash", name: "Jazzcash", balance: 0 },
];

const empty = {
  date: new Date().toISOString().slice(0, 10),
  description: "",
  category: "Client Receipt",
  subCategory: "",
  party: "",
  tripRef: "",
  debit: "",
  credit: "",
  paymentMethod: "Faysal Bank",
  bankAccount: "Faysal Bank",
  accountMode: "Faysal Bank",
  otherAccount: "",
  status: "Completed",
  enteredBy: "",
  notes: "",
  otherName: "",
  clientTotalPackage: "",
  clientAmountPaid: "",
  hotelAgreedCost: "",
  clientPhone: "",
  clientContact: "",
  clientEmail: "",
  clientNotes: "",
};

export function TransactionManager({
  periodId,
  txns,
}: {
  periodId: string;
  txns: Txn[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Txn | null>(null);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(empty);
  const [options, setOptions] = useState<Option[]>([]);
  const [showOther, setShowOther] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [outstanding, setOutstanding] = useState<Outstanding>(null);

  const isClientCategory = INBOUND_CATEGORIES.includes(form.category);
  const isHotelCategory = form.category === "Hotel Payment";
  const isOutboundCategory = OUTBOUND_CHECK_CATEGORIES.includes(form.category);
  const shouldCheckOutstanding = isClientCategory || isOutboundCategory;

  // ── Load bank accounts ──
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/accounts");
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (cancelled) return;
        const list: Account[] =
          Array.isArray(data) && data.length > 0 ? data : FALLBACK_ACCOUNTS;
        setAccounts(list);
      } catch {
        if (!cancelled) setAccounts(FALLBACK_ACCOUNTS);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load party options ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(
          `/api/txn-options?category=${encodeURIComponent(form.category)}&periodId=${periodId}`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setOptions(Array.isArray(data) ? data : []);
      } catch {
        /* ignore */
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [form.category, periodId, open]);

  // ── Fetch outstanding ──
  useEffect(() => {
    if (!open || !shouldCheckOutstanding) {
      setOutstanding(null);
      return;
    }
    const partyName = showOther
      ? form.otherName
      : form.party || form.subCategory;
    if (!partyName) {
      setOutstanding(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/outstanding?periodId=${periodId}&category=${encodeURIComponent(
            form.category
          )}&party=${encodeURIComponent(partyName)}`
        );
        if (!res.ok) {
          if (!cancelled) setOutstanding(null);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setOutstanding({
            value:
              typeof data.outstanding === "number" ? data.outstanding : null,
            exists: data.exists !== false,
            reason: typeof data.reason === "string" ? data.reason : undefined,
          });
        }
      } catch {
        if (!cancelled) setOutstanding(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    open,
    shouldCheckOutstanding,
    form.category,
    form.party,
    form.subCategory,
    form.otherName,
    showOther,
    periodId,
  ]);

  function openAdd() {
    setEditing(null);
    setForm({ ...empty, date: new Date().toISOString().slice(0, 10) });
    setShowOther(false);
    setOpen(true);
  }

  function openEdit(t: Txn) {
    setEditing(t);
    const acc = t.bankAccount || t.paymentMethod || "";
    setForm({
      ...empty,
      date: new Date(t.date).toISOString().slice(0, 10),
      description: t.description || "",
      category: t.category || "Other",
      subCategory: t.subCategory || "",
      party: t.party || "",
      tripRef: t.tripRef || "",
      debit: String(t.debit || 0),
      credit: String(t.credit || 0),
      paymentMethod: t.paymentMethod || "Faysal Bank",
      bankAccount: t.bankAccount || "Faysal Bank",
      accountMode: acc,
      otherAccount: "",
      status: t.status || "Completed",
      enteredBy: t.enteredBy || "",
      notes: t.notes || "",
    });
    setShowOther(false);
    setOpen(true);
  }

  function onPartySelect(value: string) {
    if (value === "__other__") {
      setShowOther(true);
      setForm((f) => ({ ...f, party: "", subCategory: "" }));
    } else {
      setShowOther(false);
      setForm((f) => ({
        ...f,
        party: value,
        subCategory: value,
        otherName: "",
      }));
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();

    const debitAmount = parseFloat(form.debit) || 0;
    const creditAmount = parseFloat(form.credit) || 0;

    const party = showOther && form.otherName ? form.otherName : form.party;
    const subCategory =
      showOther && form.otherName ? form.otherName : form.subCategory || party;

    const resolvedAccount =
      form.accountMode === "__other__"
        ? form.otherAccount.trim()
        : form.accountMode;

    if (!party) {
      alert("Please choose or type a party.");
      return;
    }
    if (!resolvedAccount) {
      alert("Please choose or type an account.");
      return;
    }

    // ════════════════════════════════════════════════════════════
    // DIRECTION SANITY CHECK
    //   OUTBOUND categories must put money in CREDIT
    //   INBOUND categories must put money in DEBIT
    // ════════════════════════════════════════════════════════════
    if (isOutboundCategory && debitAmount > 0 && creditAmount === 0) {
      const ok = confirm(
        `⚠️ Wrong direction\n\n` +
          `"${form.category}" is a payment OUT of the company, so the amount ` +
          `belongs in the **Credit** column, not Debit.\n\n` +
          `You entered ${formatPKR(debitAmount)} in Debit.\n\n` +
          `Click OK to move it to Credit automatically, or Cancel to fix it yourself.`
      );
      if (!ok) return;
      // Auto-move
      setForm((f) => ({ ...f, credit: String(debitAmount), debit: "" }));
      // Continue with the corrected value
      return save(new Event("submit") as unknown as React.FormEvent);
    }

    if (isClientCategory && creditAmount > 0 && debitAmount === 0) {
      const ok = confirm(
        `⚠️ Wrong direction\n\n` +
          `"${form.category}" is money IN from a client, so the amount ` +
          `belongs in the **Debit** column, not Credit.\n\n` +
          `You entered ${formatPKR(creditAmount)} in Credit.\n\n` +
          `Click OK to move it to Debit automatically, or Cancel to fix it yourself.`
      );
      if (!ok) return;
      setForm((f) => ({ ...f, debit: String(creditAmount), credit: "" }));
      return save(new Event("submit") as unknown as React.FormEvent);
    }

    const isClientReceipt = isClientCategory;
    const paidOut = creditAmount;
    const receivedIn = debitAmount;
    const movingAmount = isClientReceipt ? receivedIn : paidOut;

    // ════════════════════════════════════════════════════════════
    // HARD BLOCK: overpayment guard
    //
    // Skip ONLY when BOTH are true:
    //   1. user typed a new name via "Other…"
    //   2. the API confirms no such record exists (exists === false)
    // In every other case, enforce the block.
    // ════════════════════════════════════════════════════════════
    const isTypedNew = showOther && form.otherName.trim().length > 0;

    if (movingAmount > 0 && shouldCheckOutstanding) {
      let liveOutstanding: number | null = null;
      let liveExists = true;
      let liveReason: string | undefined;

      try {
        const res = await fetch(
          `/api/outstanding?periodId=${periodId}&category=${encodeURIComponent(
            form.category
          )}&party=${encodeURIComponent(party)}`
        );
        if (res.ok) {
          const data = await res.json();
          liveOutstanding =
            typeof data.outstanding === "number" ? data.outstanding : null;
          liveExists = data.exists !== false;
          liveReason = typeof data.reason === "string" ? data.reason : undefined;
        }
      } catch {
        liveOutstanding = outstanding?.value ?? null;
        liveExists = outstanding?.exists ?? true;
        liveReason = outstanding?.reason;
      }

      // Skip only for genuinely-new parties
      const treatAsNew = isTypedNew && !liveExists;

      // Block if the amount exceeds what's owed AND we know the outstanding
      if (!treatAsNew && liveOutstanding != null && movingAmount > liveOutstanding) {
        const over = movingAmount - liveOutstanding;
        if (isClientReceipt) {
          alert(
            `❌ Cannot add transaction — amount exceeds what the client owes\n\n` +
              `Client: ${party}\n` +
              `Client owes (remaining): ${formatPKR(liveOutstanding)}\n` +
              `You entered: ${formatPKR(movingAmount)}\n` +
              `Excess: ${formatPKR(over)}\n\n` +
              `Reduce the amount to ${formatPKR(liveOutstanding)} or less, ` +
              `or increase the client's Total Package on the Receivables page first.`
          );
        } else {
          alert(
            `❌ Cannot add transaction — amount exceeds what we owe\n\n` +
              `Party: ${party} (${form.category})\n` +
              `Net payable (remaining): ${formatPKR(liveOutstanding)}\n` +
              `You entered: ${formatPKR(movingAmount)}\n` +
              `Excess: ${formatPKR(over)}\n\n` +
              `Reduce the amount to ${formatPKR(liveOutstanding)} or less.`
          );
        }
        return; // ⛔ HARD STOP
      }

      // If the API says a record exists but the name didn't match,
      // shout loudly instead of letting a huge overpay through.
      if (!treatAsNew && liveExists && liveReason === "no-name-match") {
        const ok = confirm(
          `⚠️ Warning\n\n` +
            `No exact match found for "${party}" in ${form.category} for this month, ` +
            `but similar records exist.\n\n` +
            `You are about to save ${formatPKR(movingAmount)}.\n\n` +
            `Click OK to proceed anyway, or Cancel to go back and pick the ` +
            `party from the dropdown.`
        );
        if (!ok) return;
      }
    }

    // For a NEW client, check against Total Package if provided
    if (isClientReceipt) {
      const pkg = parseFloat(form.clientTotalPackage) || 0;
      if (pkg > 0 && receivedIn > pkg) {
        alert(
          `❌ Client package is ${formatPKR(pkg)}, but receipt is ${formatPKR(
            receivedIn
          )}.\n\nEither lower the receipt or raise the Total Package.`
        );
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        periodId,
        party,
        subCategory,
        paymentMethod: resolvedAccount,
        bankAccount: resolvedAccount,
        debit: parseFloat(form.debit) || 0,
        credit: parseFloat(form.credit) || 0,
        clientTotalPackage: parseFloat(form.clientTotalPackage) || 0,
        clientAmountPaid: parseFloat(form.clientAmountPaid) || 0,
        hotelAgreedCost: parseFloat(form.hotelAgreedCost) || 0,
        clientPhone: form.clientPhone || null,
        clientContact: form.clientContact || null,
        clientEmail: form.clientEmail || null,
        clientNotes: form.clientNotes || null,
        isNewClient: isTypedNew,
      };
      const res = await fetch("/api/transactions", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editing ? { ...payload, id: editing.id } : payload),
      });
      if (!res.ok) {
        const text = await res.text();
        let msg = text;
        try {
          const parsed = JSON.parse(text);
          if (parsed?.error) msg = parsed.error;
        } catch {
          /* keep raw text */
        }
        alert("❌ Cannot add transaction\n\n" + msg);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      alert("Failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this transaction? Bank balance will be reversed.")) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await res.text());
      router.refresh();
    } catch (err) {
      alert("Delete failed: " + err);
    } finally {
      setLoading(false);
    }
  }

  const totalDebit = txns.reduce((s, t) => s + t.debit, 0);
  const totalCredit = txns.reduce((s, t) => s + t.credit, 0);

  const debitNum = parseFloat(form.debit) || 0;
  const creditNum = parseFloat(form.credit) || 0;

  // ── Live hint ──
  const liveHint = (() => {
    if (!shouldCheckOutstanding) return null;
    const movingAmount = isClientCategory ? debitNum : creditNum;

    // Wrong-direction hint (before any outstanding check)
    if (isOutboundCategory && debitNum > 0 && creditNum === 0) {
      return (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
          ⚠️ You put the amount in <strong>Debit</strong>, but{" "}
          <strong>{form.category}</strong> is money going OUT. Put it in{" "}
          <strong>Credit</strong>. (It will be auto-moved on save.)
        </p>
      );
    }
    if (isClientCategory && creditNum > 0 && debitNum === 0) {
      return (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-300 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
          ⚠️ You put the amount in <strong>Credit</strong>, but{" "}
          <strong>{form.category}</strong> is money coming IN. Put it in{" "}
          <strong>Debit</strong>. (It will be auto-moved on save.)
        </p>
      );
    }

    if (movingAmount <= 0) return null;
    if (outstanding == null) return null;

    if (!outstanding.exists) {
      if (isClientCategory) {
        const pkg = parseFloat(form.clientTotalPackage) || 0;
        if (pkg > 0) {
          if (movingAmount > pkg) {
            return (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
                ⚠️ Receipt ({formatPKR(movingAmount)}) exceeds Total Package (
                {formatPKR(pkg)}). Saving will be blocked.
              </p>
            );
          }
          return (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
              New client — package {formatPKR(pkg)}, paying {formatPKR(movingAmount)},
              remaining {formatPKR(Math.max(0, pkg - movingAmount))}
            </p>
          );
        }
      }
      return (
        <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
          No existing record for this party in this month — will be treated as new.
        </p>
      );
    }

    if (outstanding.value == null) return null;

    if (movingAmount > outstanding.value) {
      return (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
          ⚠️ Amount exceeds what is owed. Outstanding is{" "}
          <strong>{formatPKR(outstanding.value)}</strong>, but you entered{" "}
          <strong>{formatPKR(movingAmount)}</strong>. Saving will be blocked.
        </p>
      );
    }

    return (
      <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1.5 col-span-2 md:col-span-4">
        Outstanding: <strong>{formatPKR(outstanding.value)}</strong>
        {" · "}
        Remaining after this:{" "}
        <strong>{formatPKR(Math.max(0, outstanding.value - movingAmount))}</strong>
      </p>
    );
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-3 text-sm">
          <span className="bg-slate-100 px-3 py-1.5 rounded-md">
            Debits: <strong>{formatPKR(totalDebit)}</strong>
          </span>
          <span className="bg-slate-100 px-3 py-1.5 rounded-md">
            Credits: <strong>{formatPKR(totalCredit)}</strong>
          </span>
          <span
            className={`px-3 py-1.5 rounded-md ${totalDebit - totalCredit === 0
              ? "bg-emerald-100 text-emerald-800"
              : "bg-amber-100 text-amber-800"
              }`}
          >
            Balance (D-C): <strong>{formatPKR(totalDebit - totalCredit)}</strong>
          </span>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium"
        >
          <Plus size={16} /> Add Transaction
        </button>
      </div>

      {open && (
        <form
          onSubmit={save}
          className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3"
        >
          <div className="flex justify-between items-center">
            <h3 className="font-semibold text-slate-800">
              {editing ? "Edit Transaction" : "New Transaction"}
            </h3>
            <button type="button" onClick={() => setOpen(false)}>
              <X size={18} />
            </button>
          </div>
          <p className="text-xs text-slate-600">
            Choose <strong>Category</strong> first — Sub-Category / Party lists hotels, suppliers,
            clients or staff you owe / who owe you. Pick <strong>Other…</strong> to type a new name.
            {" "}<strong>Debit = money IN &middot; Credit = money OUT.</strong>
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field
              label="Date"
              type="date"
              value={form.date}
              onChange={(v) => setForm({ ...form, date: v })}
              required
            />
            <Field
              label="Description"
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
              required
            />
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">Category</span>
              <select
                value={form.category}
                onChange={(e) => {
                  setForm({
                    ...form,
                    category: e.target.value,
                    party: "",
                    subCategory: "",
                  });
                  setShowOther(false);
                }}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {CATEGORIES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="text-slate-600 font-medium">
                Party / Sub-Category (from {form.category})
              </span>
              <select
                value={showOther ? "__other__" : form.party || form.subCategory || ""}
                onChange={(e) => onPartySelect(e.target.value)}
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">— Select —</option>
                {options.map((o) => (
                  <option key={o.value + o.label} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            {showOther && (
              <Field
                label="Name of Other (will be saved)"
                value={form.otherName}
                onChange={(v) =>
                  setForm({ ...form, otherName: v, party: v, subCategory: v })
                }
                required
              />
            )}

            <Field
              label="Trip / Booking Ref"
              value={form.tripRef}
              onChange={(v) => setForm({ ...form, tripRef: v })}
            />
            <Field
              label="Debit - money IN (PKR)"
              type="number"
              value={form.debit}
              onChange={(v) => setForm({ ...form, debit: v })}
            />
            <Field
              label="Credit - money OUT (PKR)"
              type="number"
              value={form.credit}
              onChange={(v) => setForm({ ...form, credit: v })}
            />

            {isClientCategory && (
              <>
                <Field
                  label="Client Total Package (PKR) — full trip value"
                  type="number"
                  value={form.clientTotalPackage}
                  onChange={(v) => setForm({ ...form, clientTotalPackage: v })}
                />
                <p className="text-xs text-amber-800 col-span-2 md:col-span-4 -mt-1">
                  Total Package = full sale (updates Clients tab). Debit = amount paid now.
                  Leave Total Package blank on follow-up payments for existing clients.
                </p>
              </>
            )}

            {isClientCategory && showOther && (
              <>
                <Field
                  label="New Client Phone"
                  value={form.clientPhone}
                  onChange={(v) => setForm({ ...form, clientPhone: v })}
                />
                <Field
                  label="New Client Contact / Ref"
                  value={form.clientContact}
                  onChange={(v) => setForm({ ...form, clientContact: v })}
                />
                <Field
                  label="New Client Email"
                  value={form.clientEmail}
                  onChange={(v) => setForm({ ...form, clientEmail: v })}
                />
                <Field
                  label="New Client Notes"
                  value={form.clientNotes}
                  onChange={(v) => setForm({ ...form, clientNotes: v })}
                />
                <p className="text-xs text-emerald-800 col-span-2 md:col-span-4 -mt-1">
                  A new Client will be created in the Clients master with these details.
                </p>
              </>
            )}

            {isHotelCategory && (
              <>
                <Field
                  label="Hotel Agreed / Booking Cost (PKR)"
                  type="number"
                  value={form.hotelAgreedCost}
                  onChange={(v) => setForm({ ...form, hotelAgreedCost: v })}
                />
                <p className="text-xs text-amber-800 col-span-2 md:col-span-4 -mt-1">
                  Total agreed amount with the hotel. Credit = amount paid now.
                  Enter the full booking cost here so the hotel&apos;s remaining
                  payable is calculated correctly.
                </p>
              </>
            )}

            {liveHint}

            <label className="block text-xs col-span-2">
              <span className="text-slate-600 font-medium">
                Account (Payment Method)
              </span>
              <select
                value={form.accountMode}
                onChange={(e) =>
                  setForm({ ...form, accountMode: e.target.value })
                }
                className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {accounts.length > 0 && (
                  <optgroup label="Bank / Cash Accounts (from Bank page)">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.name}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="Cash">
                  <option value="Cash">Cash</option>
                  <option value="Petty Cash">Petty Cash</option>
                </optgroup>

                <optgroup label="Other">
                  <option value="Cheque">Cheque</option>
                  <option value="__other__">Other…</option>
                </optgroup>
              </select>
            </label>

            {form.accountMode === "__other__" && (
              <Field
                label="Enter account name (will be saved)"
                value={form.otherAccount}
                onChange={(v) => setForm({ ...form, otherAccount: v })}
                required
              />
            )}

            <Select
              label="Status"
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={["Pending", "Completed", "Cancelled"]}
            />
            <Field
              label="Entered By"
              value={form.enteredBy}
              onChange={(v) => setForm({ ...form, enteredBy: v })}
            />
          </div>
          <Field
            label="Notes"
            value={form.notes}
            onChange={(v) => setForm({ ...form, notes: v })}
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
          >
            {loading ? "Saving..." : editing ? "Update" : "Save Transaction"}
          </button>
        </form>
      )}

      {txns.length === 0 ? (
        <div className="bg-white rounded-xl border p-10 text-center text-slate-500 text-sm">
          No transactions yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  {[
                    "Date",
                    "Description",
                    "Category",
                    "Party",
                    "Debit",
                    "Credit",
                    "Account",
                    "Status",
                    "Actions",
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
                {txns.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b border-slate-100 hover:bg-slate-50/80"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {new Date(t.date).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-3 py-2 max-w-[200px] truncate">
                      {t.description}
                    </td>
                    <td className="px-3 py-2">{t.category}</td>
                    <td className="px-3 py-2">
                      {t.party || t.subCategory || "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.debit ? formatPKR(t.debit) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {t.credit ? formatPKR(t.credit) : "-"}
                    </td>
                    <td className="px-3 py-2">{t.bankAccount || "-"}</td>
                    <td className="px-3 py-2">{t.status}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        onClick={() => openEdit(t)}
                        className="p-1.5 text-sky-600 hover:bg-sky-50 rounded"
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => remove(t.id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded ml-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="block text-xs">
      <span className="text-slate-600 font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-amber-300 bg-white rounded-md px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}