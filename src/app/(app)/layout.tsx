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
      <div className="min-h-screen bg-slate-50">
        <LoadingOverlay />
        <Sidebar />
        <main className="lg:pl-64 min-h-screen">
          <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </LoadingProvider>
  );
}