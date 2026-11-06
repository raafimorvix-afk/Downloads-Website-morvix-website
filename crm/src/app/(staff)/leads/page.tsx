import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { ACTIONS, STATUSES, actionTone, statusTone } from "@/lib/leads";
import { formatAppt, formatDate } from "@/lib/format";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Leads" };
const PAGE = 50;

type Row = { id: string; code: string; company: string; city: string | null; state: string | null; status: string;
  submitted_at: string; appt_at: string | null; appt_timezone: string | null; phone: string | null; price: number | null;
  client: { company: string } | null; agent: { full_name: string } | null; agent_name_raw: string | null; shift_id: string };

export default async function LeadsPage({ searchParams }: PageProps<"/leads">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const shift = shiftFilter(me, sp.shift);
  const status = str("status"), action = str("action"), q = str("q").trim();
  const page = Math.max(1, Number(str("page")) || 1);

  const supabase = await createClient();
  let query = supabase.from("leads")
    .select("id, code, company, city, state, status, submitted_at, appt_at, appt_timezone, phone, price, agent_name_raw, shift_id, client:clients(company), agent:profiles!leads_agent_id_fkey(full_name)", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (shift) query = query.eq("shift_id", shift);
  if (status) query = query.eq("status", status);
  if (q) {
    const safe = q.replace(/[%,()]/g, " ");
    query = query.or(`company.ilike.%${safe}%,code.ilike.%${safe}%,phone.ilike.%${safe}%,contact_name.ilike.%${safe}%,city.ilike.%${safe}%`);
  }
  if (action) {
    let ids = supabase.from("lead_actions").select("id").eq("next_action", action);
    if (shift) ids = ids.eq("shift_id", shift);
    const { data } = await ids;
    query = query.in("id", (data ?? []).map((r) => r.id).concat("00000000-0000-0000-0000-000000000000"));
  }
  const [{ data, count, error }, shifts] = await Promise.all([query, getShifts()]);
  const rows = (data ?? []) as unknown as Row[];
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const link = (p: number) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ status, action, q, shift: me.role === "owner" ? shift ?? "" : "" })) if (v) u.set(k, v);
    if (p > 1) u.set("page", String(p));
    return `/leads?${u}`;
  };

  return (
    <div>
      <PageHeader title="Leads" sub={`${count ?? 0} leads${shift ? ` · ${shiftName.get(shift)}` : " · all shifts"}`} />
      <form className="card mb-4 grid grid-cols-1 gap-3 p-4 sm:grid-cols-5">
        <input name="q" defaultValue={q} placeholder="Search company, phone, lead #, city" className="field-input sm:col-span-2" aria-label="Search" />
        <select name="status" defaultValue={status} className="field-input" aria-label="Status">
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s}>{s}</option>)}
        </select>
        <select name="action" defaultValue={action} className="field-input" aria-label="Next action">
          <option value="">Any next action</option>
          {ACTIONS.map((a) => <option key={a.key}>{a.key}</option>)}
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
      {error && <p className="mb-3 text-sm text-red-700">Could not load leads.</p>}

      <section className="card overflow-hidden">
        {rows.length === 0 ? <Empty>No leads match.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Lead</th><th className="px-4 py-2">Company</th><th className="px-4 py-2">Agent</th>
                  <th className="px-4 py-2">Appointment</th><th className="px-4 py-2">Client</th><th className="px-4 py-2">Status</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2">
                      <Link href={`/leads/${l.id}`} className="font-mono text-xs text-brand-700 hover:underline">{l.code}</Link>
                      <div className="text-xs text-slate-500">{formatDate(l.submitted_at)}</div>
                    </td>
                    <td className="px-4 py-2">
                      <Link href={`/leads/${l.id}`} className="font-medium hover:underline">{l.company}</Link>
                      <div className="text-xs text-slate-500">{[l.city, l.state].filter(Boolean).join(", ")}{!shift && ` · ${shiftName.get(l.shift_id)}`}</div>
                    </td>
                    <td className="px-4 py-2">{l.agent?.full_name ?? l.agent_name_raw ?? ""}</td>
                    <td className="whitespace-nowrap px-4 py-2">{formatAppt(l.appt_at, l.appt_timezone)}</td>
                    <td className="px-4 py-2">{l.client?.company ?? <span className="text-slate-400">Not sent</span>}</td>
                    <td className="px-4 py-2"><Badge className={statusTone(l.status)}>{l.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-center gap-3 text-sm" aria-label="Pages">
          {page > 1 && <Link className="btn-secondary" href={link(page - 1)}>← Previous</Link>}
          <span>Page {page} of {pages}</span>
          {page < pages && <Link className="btn-secondary" href={link(page + 1)}>Next →</Link>}
        </nav>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Tip: <Badge className={actionTone("QA this lead")}>QA this lead</Badge> and other next actions are on the Dashboard.
      </p>
    </div>
  );
}
