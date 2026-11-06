import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { money } from "@/lib/leads";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const supabase = await createClient();
  let query = supabase.from("clients")
    .select("id, code, company, status, contact_name, email, phone, coverage_area, default_price, shift_id, leads(status, price, invoice_status)")
    .order("company");
  if (shift) query = query.eq("shift_id", shift);
  if (status) query = query.eq("status", status);
  if (q) { const s = q.replace(/[%,()]/g, " "); query = query.or(`company.ilike.%${s}%,contact_name.ilike.%${s}%,email.ilike.%${s}%,coverage_area.ilike.%${s}%`); }
  const [{ data }, shifts] = await Promise.all([query, getShifts()]);
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));

  return (
    <div>
      <PageHeader title="Clients" sub={`${data?.length ?? 0} clients`}>
        <Link href="/clients/new" className="btn-primary">+ Add client</Link>
      </PageHeader>
      <form className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-4">
        <input name="q" defaultValue={q} placeholder="Search company, contact, area" className="field-input sm:col-span-2" aria-label="Search" />
        <select name="status" defaultValue={status} className="field-input" aria-label="Status">
          <option value="">Any status</option><option>Active</option><option>Paused</option><option>Stopped</option>
        </select>
        <div className="flex gap-2">
          {me.role === "owner" && (
            <select name="shift" defaultValue={shift ?? ""} className="field-input" aria-label="Shift">
              <option value="">All shifts</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          <button className="btn-primary">Filter</button>
        </div>
      </form>
      <section className="card overflow-hidden">
        {!data?.length ? <Empty>No clients yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Client</th><th className="px-4 py-2">Contact</th><th className="px-4 py-2">Area</th>
                  <th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right">Sent</th><th className="px-4 py-2 text-right">Pass</th>
                  <th className="px-4 py-2 text-right">Decline</th><th className="px-4 py-2 text-right">Billed</th><th className="px-4 py-2 text-right">Paid</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((c) => {
                  const ls = (c.leads ?? []) as { status: string; price: number | null; invoice_status: string }[];
                  const pass = ls.filter((l) => l.status === "Pass");
                  return (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link href={`/clients/${c.id}`} className="font-medium text-brand-700 hover:underline">{c.company}</Link>
                        <div className="text-xs text-slate-500">
                          {c.code} · <Badge className={c.status === "Active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200"}>{c.status}</Badge>
                          {!shift && ` · ${shiftName.get(c.shift_id)}`}
                        </div>
                      </td>
                      <td className="px-4 py-2">{c.contact_name}<div className="text-xs text-slate-500">{c.email}</div></td>
                      <td className="max-w-48 px-4 py-2 text-xs">{c.coverage_area}</td>
                      <td className="px-4 py-2 text-right">{c.default_price ? money(c.default_price) : ""}</td>
                      <td className="px-4 py-2 text-right">{ls.length}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{pass.length}</td>
                      <td className="px-4 py-2 text-right text-red-700">{ls.filter((l) => l.status === "Decline").length}</td>
                      <td className="px-4 py-2 text-right">{money(pass.reduce((a, l) => a + Number(l.price ?? 0), 0))}</td>
                      <td className="px-4 py-2 text-right">{money(pass.filter((l) => l.invoice_status === "Paid").reduce((a, l) => a + Number(l.price ?? 0), 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
