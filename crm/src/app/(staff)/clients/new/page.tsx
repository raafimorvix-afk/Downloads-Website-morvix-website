import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts } from "@/lib/shifts";
import { Flash } from "@/components/ui";
import { ClientForm } from "../client-form";
import { createClientRecord } from "../actions";

export const metadata: Metadata = { title: "Add client" };

export default async function NewClient({ searchParams }: PageProps<"/clients/new">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: managers }, { data: campaigns }, shifts] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "manager").eq("active", true).order("full_name"),
    supabase.from("campaigns").select("id, name").order("name"),
    getShifts(),
  ]);
  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/clients" className="text-sm text-slate-500 hover:underline">← Clients</Link>
      <h1 className="mb-4 mt-1 text-2xl font-semibold">Add client</h1>
      <Flash err={sp.err} />
      <ClientForm action={createClientRecord} managers={managers ?? []} campaigns={campaigns ?? []}
        shifts={me.role === "owner" ? shifts : undefined} submit="Add client" />
    </div>
  );
}
