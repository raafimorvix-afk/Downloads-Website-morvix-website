import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { money } from "@/lib/leads";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { areaLabel, clientAreas } from "@/lib/areas";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage({ searchParams }: PageProps<"/clients">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" ? sp.status : "";
  const view = sp.view === "area" ? "area" : "list";
  const areaF = typeof sp.area === "string" ? sp.area : "";
  const supabase = await createClient();
  let query = supabase.from("clients")
    .select("id, code, company, status, contact_name, email, phone, coverage_area, default_price, shift_id, leads(status, price, invoice_status, state)")
    .order("company");
  if (shift) query = query.eq("shift_id", shift);
  if (status) query = query.eq("status", status);
  if (q) { const s = q.replace(/[%,()]/g, " "); query = query.or(`company.ilike.%${s}%,contact_name.ilike.%${s}%,email.ilike.%${s}%,coverage_area.ilike.%${s}%`); }
  const [{ data }, shifts] = await Promise.all([query, getShifts()]);
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));
  const auShift = shifts.find((x) => x.name.toLowerCase().includes("australia"))?.id;
  type L = { status: string; price: number | null; invoice_status: string; state: string | null };
  const all = (data ?? []).map((c) => ({ ...c, areas: clientAreas(c.coverage_area, c.shift_id === auShift, ((c.leads ?? []) as L[]).map((l) => l.state)) }));
  const areaCount = new Map<string, number>();
  all.forEach((c) => c.areas.forEach((a) => areaCount.set(a, (areaCount.get(a) ?? 0) + 1)));
  const areaKeys = [...areaCount.keys()].sort((a, b) => (a === "unknown" ? 1 : b === "unknown" ? -1 : a === "nationwide" ? -1 : b === "nationwide" ? 1 : areaLabel(a).localeCompare(areaLabel(b))));
  const shown = areaF ? all.filter((c) => c.areas.includes(areaF) || (areaF !== "unknown" && c.areas.includes("nationwide"))) : all;
  const link = (v: string, area = areaF) => { const u = new URLSearchParams(); for (const [k, val] of Object.entries({ q, status, area, shift: me.role === "owner" ? shift ?? "" : "", view: v })) if (val && !(k === "view" && val === "list")) u.set(k, val); return `/clients?${u}`; };

  return (
    <div>
      <PageHeader title="Clients" sub={`${shown.length} clients${areaF ? ` in ${areaLabel(areaF)}` : ""}`}>
        <div className="flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="View">
          <Link href={link("list")} className={`rounded-md px-3 py-1.5 text-sm ${view === "list" ? "bg-brand-600 text-white" : "text-slate-600"}`}>List</Link>
          <Link href={link("area")} className={`rounded-md px-3 py-1.5 text-sm ${view === "area" ? "bg-brand-600 text-white" : "text-slate-600"}`}>By area</Link>
        </div>
        <Link href="/clients/new" className="btn-primary">+ Add client</Link>
      </PageHeader>
      <form className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
        {view === "area" && <input type="hidden" name="view" value="area" />}
        <input name="q" defaultValue={q} placeholder="Search company, contact, area" className="field-input sm:col-span-2" aria-label="Search" />
        <select name="area" defaultValue={areaF} className="field-input" aria-label="Area">
          <option value="">Any area</option>
          {areaKeys.map((a) => <option key={a} value={a}>{areaLabel(a)} · {areaCount.get(a)}</option>)}
        </select>
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
        {view === "area" ? (
          !shown.length ? <Empty>No clients in this area.</Empty> : (
            <div className="grid items-start gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
              {(areaF ? [areaF] : areaKeys).map((a) => {
                const list = shown.filter((c) => c.areas.includes(a));
                if (!list.length) return null;
                return (
                  <div key={a} className="rounded-lg ring-1 ring-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-2">
                      <Link href={link("area", a)} className="font-semibold hover:underline">{areaLabel(a)}</Link>
                      <span className="text-xs text-slate-500">{list.length} client{list.length > 1 ? "s" : ""}</span>
                    </div>
                    <ul className="divide-y divide-slate-100 text-sm">
                      {list.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                          <Link href={`/clients/${c.id}`} className="truncate text-brand-700 hover:underline">{c.company}</Link>
                          <Badge className={c.status === "Active" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-50 text-slate-600 ring-slate-200"}>{c.status}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )
        ) : !shown.length ? <Empty>No clients match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Client</th><th className="px-4 py-2">Contact</th><th className="px-4 py-2">Area</th>
                  <th className="px-4 py-2 text-right">Price</th><th className="px-4 py-2 text-right">Sent</th><th className="px-4 py-2 text-right">Pass</th>
                  <th className="px-4 py-2 text-right">Decline</th><th className="px-4 py-2 text-right">Billed</th><th className="px-4 py-2 text-right">Paid</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((c) => {
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
                      <td className="max-w-56 px-4 py-2 text-xs">
                        <div className="flex flex-wrap gap-1">{c.areas.map((a) => <span key={a} className="rounded bg-slate-100 px-1.5 py-0.5">{a === "unknown" ? "Not set" : a === "nationwide" ? "Nationwide" : a.split("-")[1]}</span>)}</div>
                        {c.coverage_area && <div className="mt-0.5 text-slate-500">{c.coverage_area}</div>}
                      </td>
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
