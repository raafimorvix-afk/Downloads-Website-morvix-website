import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { shiftFilter } from "@/lib/shifts";
import { stripe, stripeMode } from "@/lib/stripe";
import { Field, Flash, PageHeader } from "@/components/ui";
import { cancelPaymentLink, createPaymentLink } from "./actions";

export const metadata: Metadata = { title: "Billing" };
const fmt = (n: number, cur = "usd") => new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(Number(n));

type Lead = { id: string; code: string; company: string; price: number | null; decided_at: string | null;
  client: { id: string; company: string; currency: string; email: string | null } | null };

export default async function BillingPage({ searchParams }: PageProps<"/billing">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const connected = !!stripe();
  const supabase = await createClient();
  let qLeads = supabase.from("leads").select("id, code, company, price, decided_at, client:clients(id, company, currency, email)")
    .eq("status", "Pass").eq("invoice_status", "Not Invoiced").not("client_id", "is", null).order("decided_at", { ascending: false }).limit(1000);
  let qLinks = supabase.from("payment_links").select("id, amount, currency, description, url, status, emailed_at, paid_at, created_at, client:clients(company)")
    .order("created_at", { ascending: false }).limit(50);
  let qClients = supabase.from("clients").select("id, company, currency").neq("status", "Stopped").order("company");
  if (shift) { qLeads = qLeads.eq("shift_id", shift); qLinks = qLinks.eq("shift_id", shift); qClients = qClients.eq("shift_id", shift); }
  const [{ data: leads }, { data: links }, { data: clients }] = await Promise.all([qLeads, qLinks, qClients]);

  const groups = new Map<string, { client: NonNullable<Lead["client"]>; leads: Lead[] }>();
  for (const l of (leads ?? []) as unknown as Lead[]) {
    if (!l.client) continue;
    const g = groups.get(l.client.id) ?? { client: l.client, leads: [] };
    g.leads.push(l); groups.set(l.client.id, g);
  }
  const list = [...groups.values()].sort((a, b) => b.leads.length - a.leads.length);

  return (
    <div className="space-y-5">
      <PageHeader title="Billing" sub={connected ? `Stripe connected (${stripeMode()} mode)` : "Stripe not connected yet"} />
      <Flash ok={sp.ok} err={sp.err} />
      {typeof sp.link === "string" && sp.link && (
        <div className="card flex flex-wrap items-center gap-3 p-4 text-sm">
          <span className="font-medium">Payment link:</span>
          <a href={sp.link} target="_blank" rel="noreferrer" className="break-all text-brand-700 underline">{sp.link}</a>
        </div>
      )}
      {!connected && (
        <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200">
          <b>Connect Stripe to create payment links.</b> An owner pastes the Stripe key into Vercel (Settings → Environment Variables → <code>STRIPE_SECRET_KEY</code>), then redeploys. You can still see what is ready to bill below.
        </div>
      )}

      <section className="card p-4">
        <h2 className="font-semibold">Ready to bill · passed leads not invoiced</h2>
        <p className="mb-3 text-sm text-slate-500">Tick the leads to include. One payment link per client; leads become &quot;Invoiced&quot; and turn &quot;Paid&quot; automatically when the client pays.</p>
        {!list.length ? <p className="py-6 text-center text-sm text-slate-500">Nothing waiting to be billed.</p> : (
          <div className="space-y-3">
            {list.map(({ client, leads }) => {
              const priced = leads.filter((l) => Number(l.price) > 0);
              const total = priced.reduce((a, l) => a + Number(l.price), 0);
              return (
                <details key={client.id} className="rounded-lg ring-1 ring-slate-200">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-medium">{client.company}</span>
                    <span className="text-sm text-slate-600">{leads.length} leads · {fmt(total, client.currency)}{priced.length < leads.length ? ` · ${leads.length - priced.length} without price` : ""}</span>
                  </summary>
                  <form action={createPaymentLink} className="border-t border-slate-100 px-4 py-3">
                    <input type="hidden" name="client_id" value={client.id} />
                    <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
                      {leads.map((l) => (
                        <li key={l.id} className="flex items-center gap-2">
                          <input type="checkbox" name="lead_id" value={l.id} defaultChecked={Number(l.price) > 0} disabled={!(Number(l.price) > 0)} id={`l-${l.id}`} />
                          <label htmlFor={`l-${l.id}`} className="flex-1">{l.code} · {l.company}</label>
                          {Number(l.price) > 0 ? <span>{fmt(Number(l.price), client.currency)}</span>
                            : <Link href={`/leads/${l.id}`} className="text-xs text-amber-700 underline">set price</Link>}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email_client" defaultChecked={!!client.email} disabled={!client.email} />
                        {client.email ? `Email the link to ${client.email}` : "No client email: copy the link after creating it"}</label>
                      <button className="btn-primary" disabled={!connected || !priced.length}>Create payment link</button>
                    </div>
                  </form>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Custom amount</h2>
        <form action={createPaymentLink} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Field label="Client">
            <select name="client_id" required className="field-input" defaultValue="">
              <option value="">Choose</option>
              {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.company} ({c.currency.toUpperCase()})</option>)}
            </select>
          </Field>
          <Field label="Amount"><input name="amount" type="number" min="1" step="0.01" required className="field-input" /></Field>
          <Field label="What it is for" span={2}><input name="description" placeholder="e.g. Deposit for 20 appointments" className="field-input" /></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" name="email_client" defaultChecked /> Email the link to the client</label>
          <button className="btn-primary" disabled={!connected}>Create payment link</button>
        </form>
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">Payment links</h2>
        {!links?.length ? <p className="px-4 py-8 text-center text-sm text-slate-500">No payment links yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Client</th><th className="px-4 py-2">For</th><th className="px-4 py-2 text-right">Amount</th>
                  <th className="px-4 py-2">Status</th><th className="px-4 py-2">Link</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {links.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium">{(p.client as unknown as { company: string } | null)?.company}</td>
                    <td className="max-w-64 truncate px-4 py-2 text-slate-600" title={p.description ?? ""}>{p.description}</td>
                    <td className="px-4 py-2 text-right">{fmt(Number(p.amount), p.currency)}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ring-1 ${p.status === "Paid" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : p.status === "Open" ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-50 text-slate-500 ring-slate-200"}`}>
                        {p.status === "Paid" ? "✓ Paid" : p.status === "Open" ? "Waiting" : p.status}
                      </span>
                      {p.emailed_at && <span className="ml-1 text-xs text-slate-500">emailed</span>}
                    </td>
                    <td className="px-4 py-2">{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="text-brand-700 underline">Open</a> : "–"}</td>
                    <td className="px-4 py-2 text-right">
                      {p.status === "Open" && <form action={cancelPaymentLink.bind(null, p.id)}><button className="text-xs text-slate-500 hover:text-red-700">Cancel</button></form>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
