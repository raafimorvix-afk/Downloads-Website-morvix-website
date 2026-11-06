import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { TopBar } from "@/components/topbar";

export const metadata: Metadata = { title: "Dashboard" };

// Placeholder: the manager/owner dashboard is the next page to build.
export default async function Dashboard() {
  const me = await requireProfile(["owner", "manager"]);
  return (
    <>
      <TopBar me={me} />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="card p-6">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-600">Coming next: leads, QA queue, clients, tasks and calendar.</p>
        </div>
      </main>
    </>
  );
}
