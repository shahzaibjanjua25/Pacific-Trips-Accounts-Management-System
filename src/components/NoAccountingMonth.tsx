import { CalendarDays } from "lucide-react";
import { PeriodSelector } from "./PeriodSelector";

export function NoAccountingMonth() {
  return (
    <section className="mx-auto max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
      <span className="inline-flex rounded-2xl bg-teal-50 p-3 text-teal-700"><CalendarDays size={25} /></span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-widest text-teal-700">Pacific Trips · Accounting</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Create your first month</h1>
      <p className="mb-6 mt-3 max-w-md text-sm leading-6 text-slate-600">
        Choose the month you want to work in. New accounting months are opened manually.
      </p>
      <PeriodSelector periods={[]} currentId="" allowCreate />
    </section>
  );
}
