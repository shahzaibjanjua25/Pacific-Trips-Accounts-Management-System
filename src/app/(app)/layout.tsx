import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/auth";
import { Sidebar } from "@/components/Sidebar";
import { LoadingProvider } from "@/components/LoadingProvider";
import { LoadingOverlay } from "@/components/LoadingOverlay";

export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const uid = await getSessionUserId();
  if (!uid) redirect("/login");

  return (
    <LoadingProvider>
      <div className="min-h-screen bg-[#f3f6fa] text-slate-900">
        <LoadingOverlay />
        <Sidebar />
        <main className="min-h-screen lg:pl-64">
          <div className="mx-auto max-w-[1600px] px-4 pb-8 pt-20 md:px-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </LoadingProvider>
  );
}
