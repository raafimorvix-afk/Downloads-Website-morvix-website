import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatAppt } from "@/lib/format";
import { statusTone } from "@/lib/leads";
import { Badge, Flash } from "@/components/ui";
import { ClientForm } from "../client-form";
import { updateClientRecord } from "../actions";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({ params, searchParams }: PageProps<"/clients/[id]">) {
  await requireProfile(["owner", "manager"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: c } = await supabase.from("clients").select("*, shift:shifts(name)").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: managers }, { data: campaigns }, { data: leads }] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("role", "manager").eq("active", true).order("full_name"),
    supabase.from("campaigns").select("id, name").eq("shift_id", c.shift_id).order("name"),
    supabase.from("leads").select("id, code, company, status, appt_at, appt_timezone").eq("client_id", id).order("appt_at", { ascending: false }).limit(50),
  ]);
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <Link href="/clients" className="text-sm text-slate-500 hover:underline">← Clients</Link>
        <h1 className="mt-1 text-2xl font-semibold">{c.company}</h1>
        <p className="text-sm text-slate-500">{c.code} · {c.shift?.name}</p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />
      <ClientForm action={updateClientRecord.bind(null, id)} client={c} managers={managers ?? []} campaigns={campaigns ?? []} submit="Save client" />
      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Leads sent to this client (latest 50)</h2>
        {!leads?.length ? <p className="text-sm text-slate-500">None yet.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {leads.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <Link href={`/leads/${l.id}`} className="text-brand-700 hover:underline">{l.code} · {l.company}</Link>
                <span className="text-xs text-slate-500">{formatAppt(l.appt_at, l.appt_timezone)}</span>
                <Badge className={statusTone(l.status)}>{l.status}</Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
