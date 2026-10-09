import Link from "next/link";

export default function NotFound() {
  return (
    <div className="bg-white rounded-xl border p-10 text-center">
      <h1 className="text-xl font-bold text-slate-800">Client not found</h1>
      <p className="text-sm text-slate-500 mt-2">
        The client you are looking for does not exist or was deleted.
      </p>
      <Link
        href="/clients"
        className="inline-block mt-4 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm"
      >
        Back to Clients
      </Link>
    </div>
  );
}