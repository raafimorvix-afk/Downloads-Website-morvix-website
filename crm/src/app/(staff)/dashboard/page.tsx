import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { ACTIONS, money } from "@/lib/leads";
import { formatAppt } from "@/lib/format";
import { BarList, ResultSplit, TrendChart } from "@/components/charts";
import { SERIES, STATUS } from "@/lib/palette";

export const metadata: Metadata = { title: "Dashboard" };

const RANGES = [
  { key: "7", label: "Last 7 days", days: 7 },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
] as const;

type Stats = {
  daily: { d: string; submitted: number; passes: number; declines: number }[];
  pipeline: { qa: number; to_send: number; with_clients: number; rebook: number; resale: number };
  clients: { name: string; passes: number; declines: number; billed: number }[];
  agents: { name: string; passes: number; declines: number }[];
  billed: number; paid: number; unpaid_all: number;
};
type ActionRow = { id: string; code: string; company: string; appt_at: string | null; appt_timezone: string | null; next_action: string };

// card look per action group: urgent first
const GROUPS = [
  { title: "Urgent", tone: "border-red-500", keys: ["Feedback OVERDUE", "Chase payment"] },
  { title: "Talk to clients", tone: "border-amber-500", keys: ["Get visit feedback", "Confirm visit with client", "Get new date from client"] },
  { title: "Process leads", tone: "border-brand-500", keys: ["QA this lead", "Send to client", "Pick the client", "Add appointment date"] },
  { title: "Money", tone: "border-emerald-500", keys: ["Invoice client"] },
];

export default async function Dashboard({ searchParams }: PageProps<"/dashboard">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const range = RANGES.find((r) => r.key === sp.range) ?? RANGES[1];
  const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const start = new Date(end.getTime() - range.days * 864e5);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const supabase = await createClient();
  let qActions = supabase.from("lead_actions").select("id, code, company, appt_at, appt_timezone, next_action").limit(2000);
  if (shift) qActions = qActions.eq("shift_id", shift);
  const [shifts, { data: statsData }, { data: actionsData }] = await Promise.all([
    getShifts(),
    supabase.rpc("dashboard_stats", { p_shift: shift, p_start: iso(start), p_end: iso(end) }),
    qActions,
  ]);
  const s = statsData as Stats;
  const actions = (actionsData ?? []) as ActionRow[];
  const totalSubmitted = s.daily.reduce((a, d) => a + d.submitted, 0);
  const passes = s.daily.reduce((a, d) => a + d.passes, 0);
  const declines = s.daily.reduce((a, d) => a + d.declines, 0);
  const passRate = passes + declines ? Math.round((passes / (passes + declines)) * 100) : null;
  const byAction = new Map<string, ActionRow[]>();
  actions.forEach((a) => byAction.set(a.next_action, [...(byAction.get(a.next_action) ?? []), a]));
  const shiftQ = me.role === "owner" && shift ? `&shift=${shift}` : "";
  const shiftName = shift ? shifts.find((x) => x.id === shift)?.name : "All shifts";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-slate-500">{shiftName} · {range.label.toLowerCase()}</p>
        </div>
        <form className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-white p-1 ring-1 ring-slate-200" role="group" aria-label="Period">
            {RANGES.map((r) => (
              <Link key={r.key} href={`/dashboard?range=${r.key}${shiftQ}`} aria-current={r.key === range.key ? "true" : undefined}
                className={`rounded-md px-3 py-1.5 text-sm ${r.key === range.key ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-50"}`}>{r.label}</Link>
            ))}
          </div>
          {me.role === "owner" && (
            <>
              <input type="hidden" name="range" value={range.key} />
              <select name="shift" defaultValue={shift ?? ""} className="field-input w-auto" aria-label="Shift">
                <option value="">All shifts</option>
                {shifts.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <button className="btn-secondary">Apply</button>
            </>
          )}
        </form>
      </div>

      {/* headline numbers */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5" aria-label="Headline numbers">
        <Tile label="Leads submitted" value={totalSubmitted.toLocaleString()} />
        <Tile label="Passed" value={passes.toLocaleString()} accent="text-emerald-700" />
        <Tile label="Pass rate" value={passRate === null ? "–" : `${passRate}%`} note={`${passes} of ${passes + declines} results`} />
        <Tile label="Billed (passes)" value={money(s.billed)} note={`${money(s.paid)} paid`} />
        <Tile label="Waiting on payment" value={money(s.unpaid_all)} note="Invoiced, all time" accent={s.unpaid_all ? "text-amber-700" : ""} />
      </section>

      <section className="grid gap-4 lg:grid-cols-3 [&>*]:min-w-0">
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">Leads and passes per day</h2>
          <p className="mb-3 text-xs text-slate-500">Hover the chart to see each day.</p>
          <TrendChart days={s.daily} />
        </div>
        <div className="card space-y-5 p-5">
          <div>
            <h2 className="mb-3 font-semibold">Results</h2>
            <ResultSplit parts={[
              { label: "Pass", value: passes, color: STATUS.good, icon: "✓" },
              { label: "Decline", value: declines, color: STATUS.critical, icon: "✕" },
            ]} />
          </div>
          <div>
            <h2 className="mb-2 font-semibold">Pipeline right now</h2>
            <ul className="space-y-1.5 text-sm">
              {[
                ["Waiting for QA", s.pipeline.qa, "QA this lead"],
                ["Ready to send", s.pipeline.to_send, "Send to client"],
                ["With clients", s.pipeline.with_clients, null],
                ["Rebooking", s.pipeline.rebook, "Get new date from client"],
                ["Resale / unsold", s.pipeline.resale, null],
              ].map(([label, n, action]) => (
                <li key={label as string} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                  {action ? <Link href={`/leads?action=${encodeURIComponent(action as string)}${shiftQ}`} className="text-brand-700 hover:underline">{label}</Link> : <span>{label}</span>}
                  <span className="font-semibold">{n as number}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Top clients · passes</h2>
          <BarList color={SERIES[0]} rows={s.clients.map((c) => ({ label: c.name, value: c.passes, detail: `${c.passes} pass · ${c.declines} decline · ${money(c.billed)} billed` }))} />
        </div>
        <div className="card p-5">
          <h2 className="mb-3 font-semibold">Agent leaderboard · passes</h2>
          <BarList color={SERIES[1]} rows={s.agents.map((a) => ({ label: a.name, value: a.passes,
            detail: `${a.passes} pass · ${a.declines} decline · ${a.passes + a.declines ? Math.round((a.passes / (a.passes + a.declines)) * 100) : 0}% pass rate` }))} />
        </div>
      </section>

      {/* today's work, grouped */}
      <section aria-labelledby="todo">
        <div className="mb-3 flex items-end justify-between">
          <h2 id="todo" className="text-lg font-semibold">Today&apos;s work</h2>
          <span className="text-sm text-slate-500">{actions.length} open tasks</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {GROUPS.map((g) => {
            const keys = g.keys.filter((k) => byAction.get(k)?.length);
            const n = g.keys.reduce((a, k) => a + (byAction.get(k)?.length ?? 0), 0);
            return (
              <div key={g.title} className={`card min-w-0 border-t-4 ${g.tone} p-4`}>
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">{g.title}</h3>
                  <span className="text-2xl font-semibold">{n}</span>
                </div>
                {!keys.length ? <p className="mt-3 text-sm text-slate-500">All clear.</p> : (
                  <div className="mt-3 space-y-3">
                    {keys.map((k) => {
                      const list = byAction.get(k)!;
                      return (
                        <div key={k}>
                          <Link href={`/leads?action=${encodeURIComponent(k)}${shiftQ}`} className="flex justify-between text-sm font-medium text-brand-700 hover:underline">
                            <span>{k}</span><span>{list.length} →</span>
                          </Link>
                          <ul className="mt-1 space-y-1">
                            {list.slice(0, 3).map((a) => (
                              <li key={a.id}>
                                <Link href={`/leads/${a.id}`} className="block truncate rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                                  {a.company} <span className="text-slate-400">· {formatAppt(a.appt_at, a.appt_timezone).split(" (")[0]}</span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-slate-500">Order of urgency follows the old sheet: overdue feedback first. {ACTIONS.length} kinds of task are tracked automatically.</p>
      </section>
    </div>
  );
}

function Tile({ label, value, note, accent = "" }: { label: string; value: string; note?: string; accent?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${accent}`}>{value}</div>
      {note && <div className="mt-0.5 text-xs text-slate-500">{note}</div>}
    </div>
  );
}
