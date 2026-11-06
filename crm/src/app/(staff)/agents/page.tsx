import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lastMonths } from "@/lib/leads";
import { formatBDT } from "@/lib/format";
import { Empty, Field, Flash, PageHeader } from "@/components/ui";
import { addAdjustment, removeAdjustment } from "./actions";

export const metadata: Metadata = { title: "Agents" };

type Month = { leads: number; passes: number; declines: number; auto_bonus: number; manual_bonus: number; fines: number; total: number };

export default async function AgentsPage({ searchParams }: PageProps<"/agents">) {
  await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const months = lastMonths();
  const month = typeof sp.month === "string" && months.some((m) => m.value === sp.month) ? sp.month : months[0].value;
  const supabase = await createClient();
  const [{ data: agents }, { data: adj }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, active, shift:shifts(name)").eq("role", "agent").order("full_name"),
    supabase.from("agent_adjustments").select("id, agent_id, kind, amount, reason, created_at").eq("month", `${month}-01`).order("created_at"),
  ]);
  const stats = await Promise.all((agents ?? []).map(async (a) =>
    (await supabase.rpc("agent_month", { p_agent: a.id, p_month: `${month}-01` }).maybeSingle()).data as Month | null));
  const rows = (agents ?? []).map((a, i) => ({ ...a, s: stats[i] })).sort((a, b) => (b.s?.passes ?? 0) - (a.s?.passes ?? 0));
  const totals = rows.reduce((t, r) => ({ passes: t.passes + (r.s?.passes ?? 0), pay: t.pay + Number(r.s?.total ?? 0) }), { passes: 0, pay: 0 });

  return (
    <div className="space-y-5">
      <PageHeader title="Agents" sub="Passes count toward the month the client passed the lead.">
        <form className="flex gap-2">
          <select name="month" defaultValue={month} className="field-input w-auto" aria-label="Month">
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn-secondary">Show</button>
        </form>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />

      <section className="card overflow-hidden">
        {!rows.length ? <Empty>No agents yet. Owners add them on the Team page.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Agent</th><th className="px-4 py-2 text-right">Leads</th><th className="px-4 py-2 text-right">Pass</th>
                  <th className="px-4 py-2 text-right">Decline</th><th className="px-4 py-2 text-right">Pass rate</th><th className="px-4 py-2 text-right">Pass bonus</th>
                  <th className="px-4 py-2 text-right">Extra</th><th className="px-4 py-2 text-right">Fines</th><th className="px-4 py-2 text-right">Total</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((a) => {
                  const s = a.s; const decided = (s?.passes ?? 0) + (s?.declines ?? 0);
                  return (
                    <tr key={a.id} className={a.active ? "" : "opacity-50"}>
                      <td className="px-4 py-2 font-medium">{a.full_name}<div className="text-xs font-normal text-slate-500">{(a.shift as unknown as { name: string } | null)?.name}{a.active ? "" : " · inactive"}</div></td>
                      <td className="px-4 py-2 text-right">{s?.leads ?? 0}</td>
                      <td className="px-4 py-2 text-right text-emerald-700">{s?.passes ?? 0}</td>
                      <td className="px-4 py-2 text-right text-red-700">{s?.declines ?? 0}</td>
                      <td className="px-4 py-2 text-right">{decided ? `${Math.round(((s?.passes ?? 0) / decided) * 100)}%` : ""}</td>
                      <td className="px-4 py-2 text-right">{formatBDT(s?.auto_bonus)}</td>
                      <td className="px-4 py-2 text-right">{Number(s?.manual_bonus) ? formatBDT(s?.manual_bonus) : ""}</td>
                      <td className="px-4 py-2 text-right text-red-700">{Number(s?.fines) ? "−" + formatBDT(s?.fines) : ""}</td>
                      <td className="px-4 py-2 text-right font-semibold">{formatBDT(s?.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-slate-50 font-semibold"><tr><td className="px-4 py-2">Total</td><td /><td className="px-4 py-2 text-right">{totals.passes}</td><td colSpan={5} /><td className="px-4 py-2 text-right">{formatBDT(totals.pay)}</td></tr></tfoot>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">Add a fine or extra bonus</h2>
          <form action={addAdjustment} className="grid grid-cols-2 gap-3">
            <input type="hidden" name="month" value={month} />
            <Field label="Agent" span={2}>
              <select name="agent_id" required className="field-input" defaultValue="">
                <option value="">Choose</option>
                {(agents ?? []).filter((a) => a.active).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
              </select>
            </Field>
            <Field label="Type"><select name="kind" className="field-input"><option value="fine">Fine</option><option value="bonus">Extra bonus</option></select></Field>
            <Field label="Amount (BDT)"><input name="amount" type="number" min="1" step="1" required className="field-input" /></Field>
            <Field label="Reason (the agent sees this)" span={2}><input name="reason" required maxLength={500} className="field-input" /></Field>
            <div className="col-span-2 flex justify-end"><button className="btn-primary">Save for {months.find((m) => m.value === month)?.label}</button></div>
          </form>
        </section>
        <section className="card p-4">
          <h2 className="mb-3 font-semibold">This month&apos;s fines and extra bonus</h2>
          {!adj?.length ? <p className="text-sm text-slate-500">None.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">
              {adj.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2">
                  <span><b>{agents?.find((a) => a.id === x.agent_id)?.full_name}</b> · {x.reason}</span>
                  <span className="flex items-center gap-2">
                    <span className={x.kind === "fine" ? "text-red-700" : "text-emerald-700"}>{x.kind === "fine" ? "−" : "+"}{formatBDT(x.amount)}</span>
                    <form action={removeAdjustment.bind(null, x.id, month)}><button className="text-xs text-slate-500 hover:text-red-700" aria-label="Remove">Remove</button></form>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
