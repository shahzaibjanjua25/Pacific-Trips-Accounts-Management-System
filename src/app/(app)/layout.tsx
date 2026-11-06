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
      <div className="finance-workspace min-h-screen text-slate-900">
        <LoadingOverlay />
        <Sidebar />
        <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2">Skip to content</a>
        <main id="workspace-content" className="min-h-screen lg:pl-64">
          <div className="mx-auto max-w-[1600px] px-4 pb-10 pt-20 md:px-6 lg:p-8 xl:px-10">
            {children}
          </div>
        </main>
      </div>
    </LoadingProvider>
  );
}
