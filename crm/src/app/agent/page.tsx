import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatAppt, formatBDT, formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "My results" };

type MyLead = {
  code: string; submitted_at: string; company: string; city: string | null; state: string | null;
  appt_at: string | null; appt_timezone: string | null; status: string; client_feedback: string | null;
};

const badge: Record<string, string> = {
  Pass: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Decline: "bg-red-50 text-red-700 ring-red-200",
  "QA Rejected": "bg-red-50 text-red-700 ring-red-200",
  Rebooking: "bg-amber-50 text-amber-700 ring-amber-200",
  "In progress": "bg-slate-50 text-slate-600 ring-slate-200",
};

function monthOptions() {
  // current month and the 11 before it, in Dhaka time
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Dhaka" }));
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { value, label: d.toLocaleString("en-US", { month: "long", year: "numeric" }) };
  });
}

export default async function AgentHome({ searchParams }: PageProps<"/agent">) {
  const me = await requireProfile(["agent", "owner"]);
  const months = monthOptions();
  const sp = await searchParams;
  const month = typeof sp.month === "string" && months.some((m) => m.value === sp.month) ? sp.month : months[0].value;
  const supabase = await createClient();

  const [{ data: summary }, { data: adjustments }, { data: leads }] = await Promise.all([
    supabase.rpc("agent_month", { p_agent: me.id, p_month: `${month}-01` }).maybeSingle(),
    supabase.from("agent_adjustments").select("kind, amount, reason, created_at")
      .eq("agent_id", me.id).eq("month", `${month}-01`).order("created_at"),
    supabase.rpc("my_leads"),
  ]);
  const s = (summary ?? {}) as Record<string, number>;
  const list = (leads ?? []) as MyLead[];
  const monthLabel = months.find((m) => m.value === month)!.label;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">My results</h1>
          <p className="text-sm text-slate-500">Passes count toward the month the client passed the lead.</p>
        </div>
        <div className="flex gap-2">
          <form>
            <label htmlFor="month" className="sr-only">Month</label>
            <select id="month" name="month" defaultValue={month} className="field-input w-auto">
              {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
            <button className="btn-secondary ml-2">Show</button>
          </form>
          <Link href="/agent/new" className="btn-primary">+ Submit a lead</Link>
        </div>
      </div>

      <section aria-label={`Summary for ${monthLabel}`} className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Leads submitted" value={String(s.leads ?? 0)} />
        <Stat label="Passed" value={String(s.passes ?? 0)} tone="good" />
        <Stat label="Declined" value={String(s.declines ?? 0)} tone="bad" />
        <Stat label="Fines" value={Number(s.fines) ? "−" + formatBDT(s.fines) : formatBDT(0)} tone={Number(s.fines) ? "bad" : undefined}
          note={`${(adjustments ?? []).filter((a) => a.kind === "fine").length} this month`} />
        <Stat label="Bonus this month" value={formatBDT(s.total)} tone="brand"
          note={`${formatBDT(s.auto_bonus)} from passes${Number(s.manual_bonus) ? ` + ${formatBDT(s.manual_bonus)} extra` : ""}${Number(s.fines) ? ` − ${formatBDT(s.fines)} fines` : ""}`} />
      </section>

      <p className="text-xs text-slate-500">
        Bonus rule: passes 1 to 5 earn BDT 500 each, every pass after that earns BDT 1,000.
      </p>

      <section className="card p-4">
        <h2 className="mb-2 font-semibold">Fines and extra bonus · {monthLabel}</h2>
        {!adjustments?.length ? <p className="text-sm text-slate-500">No fines or extra bonus this month.</p> : (
          <ul className="divide-y divide-slate-100 text-sm">
            {adjustments.map((a, i) => (
              <li key={i} className="flex justify-between gap-4 py-2">
                <span>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-xs ring-1 ${a.kind === "fine" ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"}`}>
                    {a.kind === "fine" ? "Fine" : "Bonus"}
                  </span>
                  {a.reason} <span className="text-xs text-slate-500">· {formatDate(a.created_at)}</span>
                </span>
                <span className={a.kind === "fine" ? "font-medium text-red-700" : "font-medium text-emerald-700"}>
                  {a.kind === "fine" ? "−" : "+"}{formatBDT(a.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden">
        <h2 className="border-b border-slate-200 px-4 py-3 font-semibold">My leads ({list.length})</h2>
        {list.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            No leads yet. <Link href="/agent/new" className="text-brand-600 underline">Submit your first lead</Link>.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2">Lead</th><th className="px-4 py-2">Company</th>
                  <th className="px-4 py-2">Appointment</th><th className="px-4 py-2">Result</th>
                  <th className="px-4 py-2">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.map((l) => (
                  <tr key={l.code}>
                    <td className="whitespace-nowrap px-4 py-2">
                      <div className="font-mono text-xs">{l.code}</div>
                      <div className="text-xs text-slate-500">{formatDate(l.submitted_at)}</div>
                    </td>
                    <td className="px-4 py-2">
                      <div className="font-medium">{l.company}</div>
                      <div className="text-xs text-slate-500">{[l.city, l.state].filter(Boolean).join(", ")}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">{formatAppt(l.appt_at, l.appt_timezone)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${badge[l.status] ?? badge["In progress"]}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{l.client_feedback ?? ""}</td>
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

function Stat({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: "good" | "bad" | "brand" }) {
  const color = tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : tone === "brand" ? "text-brand-700" : "";
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${color}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
}
