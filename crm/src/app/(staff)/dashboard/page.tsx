import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { ACTIONS, actionTone, lastMonths, money, monthStart } from "@/lib/leads";
import { formatAppt } from "@/lib/format";
import { Badge, Empty, PageHeader, Stat } from "@/components/ui";
import { ShiftPicker } from "@/components/shift-picker";

export const metadata: Metadata = { title: "Dashboard" };

type ActionRow = { id: string; code: string; company: string; appt_at: string | null; appt_timezone: string | null;
  phone: string | null; status: string; next_action: string; shift_id: string };

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const months = lastMonths();
  const month = typeof sp.month === "string" && months.some((m) => m.value === sp.month) ? sp.month : months[0].value;
  const start = monthStart(month);
  const end = new Date(new Date(start).setMonth(new Date(start).getMonth() + 1)).toISOString().slice(0, 10);

  const supabase = await createClient();
  let qSubmitted = supabase.from("leads").select("status").gte("submitted_at", start).lt("submitted_at", end);
  let qDecided = supabase.from("leads").select("status, price").gte("decided_at", start).lt("decided_at", end);
  let qActions = supabase.from("lead_actions").select("id, code, company, appt_at, appt_timezone, phone, status, next_action, shift_id").limit(1000);
  let qUnpaid = supabase.from("leads").select("price").eq("status", "Pass").eq("invoice_status", "Invoiced");
  if (shift) {
    qSubmitted = qSubmitted.eq("shift_id", shift);
    qDecided = qDecided.eq("shift_id", shift);
    qActions = qActions.eq("shift_id", shift);
    qUnpaid = qUnpaid.eq("shift_id", shift);
  }
  const [shifts, submitted, decided, actions, unpaid] = await Promise.all([getShifts(), qSubmitted, qDecided, qActions, qUnpaid]);

  const sub = submitted.data ?? [];
  const dec = decided.data ?? [];
  const passes = dec.filter((l) => l.status === "Pass");
  const declines = dec.filter((l) => l.status === "Decline").length;
  const passRate = passes.length + declines ? Math.round((passes.length / (passes.length + declines)) * 100) : null;
  const billed = passes.reduce((a, l) => a + Number(l.price ?? 0), 0);
  const owed = (unpaid.data ?? []).reduce((a, l) => a + Number(l.price ?? 0), 0);

  const rank = new Map<string, number>(ACTIONS.map((a, i) => [a.key, i]));
  const tasks = ((actions.data ?? []) as ActionRow[]).sort((a, b) =>
    (rank.get(a.next_action) ?? 99) - (rank.get(b.next_action) ?? 99) ||
    (a.appt_at ?? "").localeCompare(b.appt_at ?? ""));
  const counts = new Map<string, number>();
  tasks.forEach((t) => counts.set(t.next_action, (counts.get(t.next_action) ?? 0) + 1));
  const shiftName = new Map(shifts.map((s) => [s.id, s.name]));

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" sub={shift ? shiftName.get(shift) : "All shifts"}>
        <form className="flex gap-2">
          {shift && me.role === "owner" && <input type="hidden" name="shift" value={shift} />}
          <select name="month" defaultValue={month} className="field-input w-auto" aria-label="Month">
            {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <button className="btn-secondary">Show</button>
        </form>
        <ShiftPicker me={me} shifts={shifts} current={shift} keep={{ month }} />
      </PageHeader>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="This month">
        <Stat label="Leads submitted" value={sub.length} />
        <Stat label="Passed" value={passes.length} tone="text-emerald-700" note={passRate === null ? "No results yet" : `${passRate}% pass rate`} />
        <Stat label="Declined" value={declines} tone="text-red-700" />
        <Stat label="Billed (passes)" value={money(billed)} note={`${money(owed)} invoiced, not paid yet (all time)`} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold">To do now · work top to bottom</h2>
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.filter((a) => counts.get(a.key)).map((a) => (
              <Link key={a.key} href={`/leads?action=${encodeURIComponent(a.key)}${shift && me.role === "owner" ? `&shift=${shift}` : ""}`}>
                <Badge className={actionTone(a.key)}>{a.key} · {counts.get(a.key)}</Badge>
              </Link>
            ))}
          </div>
        </div>
        {tasks.length === 0 ? <Empty>Nothing waiting. Nice work.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-2">What to do</th><th className="px-4 py-2">Lead</th><th className="px-4 py-2">Appointment</th>
                  <th className="px-4 py-2">Phone</th>{!shift && <th className="px-4 py-2">Shift</th>}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.slice(0, 100).map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2"><Badge className={actionTone(t.next_action)}>{t.next_action}</Badge></td>
                    <td className="px-4 py-2">
                      <Link href={`/leads/${t.id}`} className="font-medium text-brand-700 hover:underline">{t.company}</Link>
                      <div className="font-mono text-xs text-slate-500">{t.code}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{formatAppt(t.appt_at, t.appt_timezone)}</td>
                    <td className="whitespace-nowrap px-4 py-2">{t.phone}</td>
                    {!shift && <td className="px-4 py-2 text-xs text-slate-500">{shiftName.get(t.shift_id)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            {tasks.length > 100 && <p className="px-4 py-2 text-xs text-slate-500">Showing the 100 most urgent of {tasks.length}.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
