import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lastMonths, money } from "@/lib/leads";
import { formatBDT } from "@/lib/format";
import { Empty, Flash, PageHeader } from "@/components/ui";
import { setBdmBonus } from "./actions";

export const metadata: Metadata = { title: "BDM" };

type Row = { manager_id: string; manager_name: string; clients_onboarded: number; passes: number; billed: number; paid: number; bonus: number | null; bonus_note: string | null };

export default async function BdmPage({ searchParams }: PageProps<"/bdm">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const months = lastMonths();
  const month = typeof sp.month === "string" && months.some((m) => m.value === sp.month) ? sp.month : months[0].value;
  const supabase = await createClient();
  const { data } = await supabase.rpc("bdm_month", { p_month: `${month}-01` });
  const rows = (data ?? []) as Row[];
  const owner = me.role === "owner";

  return (
    <div className="space-y-5">
      <PageHeader title="BDM revenue" sub="Revenue from the clients each manager onboarded. Set who onboarded a client on the client's page.">
        <form className="flex gap-2">
          <select name="month" defaultValue={month} className="field-input w-auto" aria-label="Month">
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn-secondary">Show</button>
        </form>
      </PageHeader>
      <Flash ok={sp.ok} err={sp.err} />
      <section className="card overflow-hidden">
        {!rows.length ? <Empty>No managers yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">Manager</th><th className="px-4 py-2 text-right">Clients onboarded</th><th className="px-4 py-2 text-right">Passes this month</th>
                  <th className="px-4 py-2 text-right">Billed</th><th className="px-4 py-2 text-right">Paid</th><th className="px-4 py-2">Bonus (set by owners)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.manager_id}>
                    <td className="px-4 py-2 font-medium">{r.manager_name}</td>
                    <td className="px-4 py-2 text-right">{r.clients_onboarded}</td>
                    <td className="px-4 py-2 text-right">{r.passes}</td>
                    <td className="px-4 py-2 text-right">{money(r.billed)}</td>
                    <td className="px-4 py-2 text-right">{money(r.paid)}</td>
                    <td className="px-4 py-2">
                      {owner ? (
                        <form action={setBdmBonus.bind(null, r.manager_id, month)} className="flex flex-wrap gap-2">
                          <input name="amount" type="number" min="0" step="1" defaultValue={r.bonus ?? ""} placeholder="BDT" className="field-input w-28" aria-label="Bonus amount" />
                          <input name="note" defaultValue={r.bonus_note ?? ""} placeholder="Note" className="field-input w-40" aria-label="Bonus note" />
                          <button className="btn-secondary">Save</button>
                        </form>
                      ) : r.bonus !== null ? <>{formatBDT(r.bonus)}{r.bonus_note && <span className="text-xs text-slate-500"> · {r.bonus_note}</span>}</> : <span className="text-slate-400">Not set yet</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {owner && <p className="text-xs text-slate-500">Leave the amount empty and save to remove a bonus. Managers only see their own row.</p>}
    </div>
  );
}
