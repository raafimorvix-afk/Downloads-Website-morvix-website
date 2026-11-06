import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts, shiftFilter } from "@/lib/shifts";
import { statusTone } from "@/lib/leads";

export const metadata: Metadata = { title: "Calendar" };

type Appt = { id: string; code: string; company: string; appt_at: string; appt_timezone: string | null; status: string; client: { company: string } | null };

// the appointment's own local date and time (where the visit happens)
function local(iso: string, tz: string | null) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "numeric", minute: "2-digit", hour12: true })
    .formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute} ${p.dayPeriod?.toUpperCase() ?? ""}`.trim() };
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const me = await requireProfile(["owner", "manager"]);
  const sp = await searchParams;
  const shift = shiftFilter(me, sp.shift);
  const now = new Date();
  const ym = typeof sp.m === "string" && /^\d{4}-\d{2}$/.test(sp.m) ? sp.m : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const prev = new Date(Date.UTC(y, m - 2, 1)), next = new Date(Date.UTC(y, m, 1));
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

  const supabase = await createClient();
  let q = supabase.from("leads").select("id, code, company, appt_at, appt_timezone, status, client:clients(company)")
    .gte("appt_at", new Date(Date.UTC(y, m - 1, 0)).toISOString()).lt("appt_at", new Date(Date.UTC(y, m, 2)).toISOString())
    .not("status", "in", '("QA Rejected","Future Resale","Need to Sell","Opportunity (can\'t sell)")')
    .order("appt_at").limit(1000);
  if (shift) q = q.eq("shift_id", shift);
  const [{ data }, shifts] = await Promise.all([q, getShifts()]);
  const byDay = new Map<string, (Appt & { time: string })[]>();
  for (const a of (data ?? []) as unknown as Appt[]) {
    const l = local(a.appt_at, a.appt_timezone);
    if (!l.day.startsWith(ym)) continue;
    byDay.set(l.day, [...(byDay.get(l.day) ?? []), { ...a, time: l.time }]);
  }
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const cells = Array.from({ length: Math.ceil((lead + daysIn) / 7) * 7 }, (_, i) => i - lead + 1);
  const todayKey = new Date().toISOString().slice(0, 10);
  const keep = me.role === "owner" && shift ? `&shift=${shift}` : "";
  const total = [...byDay.values()].reduce((a, l) => a + l.length, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Calendar</h1>
          <p className="text-sm text-slate-500">{total} appointments · shown in each client&apos;s local time</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/calendar?m=${fmt(prev)}${keep}`} className="btn-secondary" aria-label="Previous month">←</Link>
          <span className="min-w-36 text-center font-medium">{first.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
          <Link href={`/calendar?m=${fmt(next)}${keep}`} className="btn-secondary" aria-label="Next month">→</Link>
          {me.role === "owner" && (
            <form className="flex gap-2">
              <input type="hidden" name="m" value={ym} />
              <select name="shift" defaultValue={shift ?? ""} className="field-input w-auto" aria-label="Shift">
                <option value="">All shifts</option>
                {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <button className="btn-secondary">Apply</button>
            </form>
          )}
        </div>
      </div>
      <div className="card overflow-x-auto">
        <div className="grid min-w-[760px] grid-cols-7 border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase tracking-wide text-slate-500">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="px-2 py-2">{d}</div>)}
        </div>
        <div className="grid min-w-[760px] grid-cols-7">
          {cells.map((n, i) => {
            const key = `${ym}-${String(n).padStart(2, "0")}`;
            const items = n >= 1 && n <= daysIn ? byDay.get(key) ?? [] : [];
            return (
              <div key={i} className={`min-h-28 border-b border-r border-slate-100 p-1.5 ${n < 1 || n > daysIn ? "bg-slate-50/60" : ""}`}>
                {n >= 1 && n <= daysIn && (
                  <>
                    <div className={`mb-1 text-xs ${key === todayKey ? "inline-flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 font-semibold text-white" : "text-slate-500"}`}>{n}</div>
                    <ul className="space-y-1">
                      {items.slice(0, 4).map((a) => (
                        <li key={a.id}>
                          <Link href={`/leads/${a.id}`} title={`${a.company} · ${a.time} · ${a.status}${a.client ? ` · ${a.client.company}` : ""}`}
                            className={`block truncate rounded px-1.5 py-0.5 text-[11px] ring-1 ${statusTone(a.status)}`}>
                            <b>{a.time}</b> {a.company}
                          </Link>
                        </li>
                      ))}
                      {items.length > 4 && <li className="px-1 text-[11px] text-slate-500">+{items.length - 4} more</li>}
                    </ul>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-500">Colours follow the lead status: blue = with client, green = pass, red = decline, amber = rebook.</p>
    </div>
  );
}
