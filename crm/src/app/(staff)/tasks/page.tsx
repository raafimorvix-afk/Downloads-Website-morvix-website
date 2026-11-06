import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { TASK_GROUPS, actionTone } from "@/lib/leads";
import { formatAppt } from "@/lib/format";
import { Badge } from "@/components/ui";

export const metadata: Metadata = { title: "Tasks" };

type Row = { id: string; code: string; company: string; appt_at: string | null; appt_timezone: string | null; phone: string | null;
  next_action: string; shift_id: string; client_id: string | null; agent_id: string | null };

export default async function TasksPage({ searchParams }: PageProps<"/tasks">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const group = TASK_GROUPS.find((g) => g.key === sp.g);
  const supabase = await createClient();
  let q = supabase.from("lead_actions").select("id, code, company, appt_at, appt_timezone, phone, next_action, shift_id, client_id, agent_id").limit(3000);
  if (shift) q = q.eq("shift_id", shift);
  const [{ data }, shifts, { data: clients }] = await Promise.all([q, getShifts(), supabase.from("clients").select("id, company")]);
  const rows = (data ?? []) as Row[];
  const clientName = new Map((clients ?? []).map((c) => [c.id, c.company]));
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));
  const by = new Map<string, Row[]>();
  rows.forEach((r) => by.set(r.next_action, [...(by.get(r.next_action) ?? []), r]));
  for (const list of by.values()) list.sort((a, b) => (a.appt_at ?? "").localeCompare(b.appt_at ?? ""));
  const count = (keys: readonly string[]) => keys.reduce((a, k) => a + (by.get(k)?.length ?? 0), 0);
  const keep = (g?: string) => {
    const u = new URLSearchParams();
    if (g) u.set("g", g);
    if (me.role === "owner" && shift) u.set("shift", shift);
    return `/tasks${u.size ? "?" + u : ""}`;
  };
  const visible = group ? [group] : TASK_GROUPS;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tasks</h1>
          <p className="text-sm text-slate-500">{rows.length} open · created automatically from each lead&apos;s status · work top to bottom</p>
        </div>
        {me.role === "owner" && (
          <form className="flex gap-2">
            {group && <input type="hidden" name="g" value={group.key} />}
            <select name="shift" defaultValue={shift ?? ""} className="field-input w-auto" aria-label="Shift">
              <option value="">All shifts</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <button className="btn-secondary">Apply</button>
          </form>
        )}
      </div>

      <nav className="flex flex-wrap gap-2" aria-label="Task groups">
        <Link href={keep()} aria-current={!group ? "true" : undefined}
          className={`rounded-full px-4 py-1.5 text-sm ring-1 ${!group ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200"}`}>All · {rows.length}</Link>
        {TASK_GROUPS.map((g) => (
          <Link key={g.key} href={keep(g.key)} aria-current={group?.key === g.key ? "true" : undefined}
            className={`rounded-full px-4 py-1.5 text-sm ring-1 ${group?.key === g.key ? "bg-brand-600 text-white ring-brand-600" : "bg-white text-slate-700 ring-slate-200"}`}>
            {g.title} · {count(g.keys)}
          </Link>
        ))}
      </nav>

      {visible.map((g) => (
        <section key={g.key} className={`card border-t-4 ${g.tone} overflow-hidden`}>
          <h2 className="flex items-baseline justify-between px-4 pt-4 text-lg font-semibold">{g.title}<span className="text-sm font-normal text-slate-500">{count(g.keys)} tasks</span></h2>
          {count(g.keys) === 0 ? <p className="px-4 py-6 text-sm text-slate-500">All clear.</p> : (g.keys as readonly string[]).filter((k) => by.get(k)?.length).map((k) => (
            <div key={k} className="mt-3">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                <Badge className={actionTone(k)}>{k}</Badge>
                <span className="text-xs text-slate-500">{by.get(k)!.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {by.get(k)!.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <Link href={`/leads/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.company}</Link>
                          <div className="font-mono text-xs text-slate-500">{r.code}{!shift ? ` · ${shiftName.get(r.shift_id)}` : ""}</div>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2">{formatAppt(r.appt_at, r.appt_timezone)}</td>
                        <td className="px-4 py-2">{r.client_id ? clientName.get(r.client_id) : <span className="text-slate-400">No client yet</span>}</td>
                        <td className="whitespace-nowrap px-4 py-2">{r.phone && <a href={`tel:${r.phone}`} className="text-slate-700 hover:underline">{r.phone}</a>}</td>
                        <td className="px-4 py-2 text-right"><Link href={`/leads/${r.id}`} className="btn-secondary px-3 py-1 text-xs">Open</Link></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
