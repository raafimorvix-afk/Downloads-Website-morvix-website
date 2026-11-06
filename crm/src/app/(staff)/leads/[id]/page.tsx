import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { INVOICE_STATUSES, STATUSES, actionTone, money, statusTone } from "@/lib/leads";
import { TIMEZONES, formatAppt, toLocalInput } from "@/lib/format";
import { Badge, Field, Flash } from "@/components/ui";
import { addNote, qaDecision, resendEmail, saveBilling, saveDetails, saveStatus, sendToClient } from "./actions";

export const metadata: Metadata = { title: "Lead" };

const dt = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));

export default async function LeadPage({ params, searchParams }: PageProps<"/leads/[id]">) {
  await requireProfile(["owner", "manager"]);
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: l } = await supabase.from("leads")
    .select("*, client:clients(id, company, email, auto_send_leads, send_recordings), agent:profiles!leads_agent_id_fkey(full_name), shift:shifts(name, from_email)")
    .eq("id", id).maybeSingle();
  if (!l) notFound();

  const [{ data: clients }, { data: campaigns }, { data: recs }, { data: events }, { data: emails }, { data: act }] = await Promise.all([
    supabase.from("clients").select("id, company, status, default_price, coverage_area").eq("shift_id", l.shift_id).neq("status", "Stopped").order("company"),
    supabase.from("campaigns").select("id, name").eq("shift_id", l.shift_id).order("name"),
    supabase.from("lead_recordings").select("id, storage_path, file_name, size_bytes, created_at").eq("lead_id", id).order("created_at"),
    supabase.from("lead_events").select("id, kind, from_status, to_status, note, created_at, actor:profiles(full_name)").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("email_log").select("id, to_emails, subject, status, error, with_recording, created_at").eq("lead_id", id).order("created_at", { ascending: false }),
    supabase.from("lead_actions").select("next_action").eq("id", id).maybeSingle(),
  ]);
  const signed = recs?.length
    ? (await supabase.storage.from("recordings").createSignedUrls(recs.map((r) => r.storage_path), 3600)).data ?? []
    : [];
  const v = (k: string) => (l[k] ?? "") as string;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/leads" className="text-sm text-slate-500 hover:underline">← All leads</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">{l.company}</h1>
          <Badge className={statusTone(l.status)}>{l.status}</Badge>
          {act?.next_action && <Badge className={actionTone(act.next_action)}>Next: {act.next_action}</Badge>}
        </div>
        <p className="text-sm text-slate-500">
          <span className="font-mono">{l.code}</span> · {l.shift?.name} · by {l.agent?.full_name ?? l.agent_name_raw ?? "unknown"} · submitted {dt(l.submitted_at)}
        </p>
      </div>
      <Flash ok={sp.ok} err={sp.err} />

      <div className="grid gap-5 lg:grid-cols-3">
        {/* -------- left: workflow -------- */}
        <div className="space-y-5 lg:col-span-1">
          <section className="card p-4">
            <h2 className="mb-1 font-semibold">Appointment</h2>
            <p className="text-sm">{formatAppt(l.appt_at, l.appt_timezone)}</p>
            <p className="mt-1 text-sm">{l.contact_name} {l.contact_designation && `(${l.contact_designation})`}</p>
            <p className="text-sm"><a className="text-brand-700 hover:underline" href={`tel:${l.phone}`}>{l.phone}</a></p>
            {l.email && <p className="text-sm"><a className="text-brand-700 hover:underline" href={`mailto:${l.email}`}>{l.email}</a></p>}
          </section>

          {l.status === "New – Needs QA" && (
            <section className="card space-y-3 p-4">
              <h2 className="font-semibold">QA check</h2>
              <form action={qaDecision.bind(null, id, "approve")}><button className="btn-primary w-full">✓ Approve lead</button></form>
              <form action={qaDecision.bind(null, id, "reject")} className="space-y-2">
                <input name="reason" placeholder="Reason (agent will see it)" className="field-input" aria-label="Reject reason" />
                <button className="btn-secondary w-full text-red-700">✕ Reject lead</button>
              </form>
            </section>
          )}

          <section className="card space-y-3 p-4">
            <h2 className="font-semibold">{l.client ? `Sent to ${l.client.company}` : "Send to a client"}</h2>
            <form action={sendToClient.bind(null, id)} className="space-y-2">
              <select name="client_id" defaultValue={l.client_id ?? ""} className="field-input" aria-label="Client" required>
                <option value="">Choose a client</option>
                {(clients ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company}{c.default_price ? ` · ${money(c.default_price)}` : ""}{c.status === "Paused" ? " (paused)" : ""}
                  </option>
                ))}
              </select>
              <input name="price" type="number" step="0.01" min="0" placeholder="Price for this lead (blank = client's default)"
                defaultValue={l.price ?? ""} className="field-input" aria-label="Price" />
              <button className="btn-primary w-full">{l.client ? "Change client and email" : "Send and email lead"}</button>
              <p className="text-xs text-slate-500">
                Emails from {l.shift?.from_email ?? "(no address)"} using the lead email template. Recordings are included only for clients set to receive them.
              </p>
            </form>
            {l.client && (
              <form action={resendEmail.bind(null, id)}><button className="btn-secondary w-full">Email it again</button></form>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Result and status</h2>
            <form action={saveStatus.bind(null, id)} className="space-y-2">
              <select name="status" defaultValue={l.status} className="field-input" aria-label="Status">
                {STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <textarea name="client_feedback" rows={3} defaultValue={v("client_feedback")} placeholder="Client feedback / reason"
                className="field-input" aria-label="Client feedback" />
              <div className="grid grid-cols-2 gap-2">
                <input type="datetime-local" name="appt_local" defaultValue={toLocalInput(l.appt_at, l.appt_timezone)} className="field-input" aria-label="Appointment date" />
                <select name="appt_timezone" defaultValue={l.appt_timezone ?? "America/New_York"} className="field-input" aria-label="Time zone">
                  {TIMEZONES.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>)}
                </select>
              </div>
              <p className="text-xs text-slate-500">For a rebook, type the new date: the lead goes back to &quot;Sent to Client&quot; by itself.</p>
              <button className="btn-primary w-full">Save status</button>
            </form>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Billing</h2>
            <form action={saveBilling.bind(null, id)} className="grid grid-cols-2 gap-2">
              <Field label="Price ($)"><input name="price" type="number" step="0.01" min="0" defaultValue={l.price ?? ""} className="field-input" /></Field>
              <Field label="Invoice status">
                <select name="invoice_status" defaultValue={l.invoice_status} className="field-input">
                  {INVOICE_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </Field>
              <Field label="Invoice #"><input name="invoice_number" defaultValue={v("invoice_number")} className="field-input" /></Field>
              <Field label="Invoice date"><input name="invoiced_at" type="date" defaultValue={v("invoiced_at")} className="field-input" /></Field>
              <Field label="Paid date"><input name="paid_at" type="date" defaultValue={v("paid_at")} className="field-input" /></Field>
              <div className="flex items-end"><button className="btn-primary w-full">Save billing</button></div>
            </form>
          </section>
        </div>

        {/* -------- right: details, recordings, history -------- */}
        <div className="space-y-5 lg:col-span-2">
          <section className="card p-4">
            <h2 className="mb-3 font-semibold">Lead details</h2>
            <form action={saveDetails.bind(null, id)} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(campaigns ?? []).length > 0 && (
                <Field label="Campaign">
                  <select name="campaign_id" defaultValue={l.campaign_id ?? ""} className="field-input">
                    <option value="">None</option>
                    {campaigns!.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </Field>
              )}
              {([
                ["company", "Company name", 2], ["business_type", "Industry type"], ["facility_size", "Facility size"],
                ["street", "Street", 2], ["city", "City"], ["state", "State"], ["zip", "ZIP"], ["country", "Country"],
                ["contact_name", "PoC name"], ["contact_designation", "PoC designation"], ["phone", "Phone"], ["email", "Email", 2],
                ["current_type", "Current type"], ["current_provider", "Current provider"], ["frequency", "Frequency"], ["preferences", "Preferences"],
              ] as [string, string, 2?][]).map(([k, label, span]) => (
                <Field key={k} label={label} span={span}><input name={k} defaultValue={v(k)} className="field-input" /></Field>
              ))}
              <Field label="Agent notes" span={3}><textarea name="agent_notes" rows={4} defaultValue={v("agent_notes")} className="field-input" /></Field>
              <div className="sm:col-span-3 flex justify-end"><button className="btn-secondary">Save details</button></div>
            </form>
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Call recordings</h2>
            {!recs?.length ? <p className="text-sm text-slate-500">No recording uploaded.</p> : (
              <ul className="space-y-3">
                {recs.map((r, i) => (
                  <li key={r.id}>
                    <div className="text-sm">{r.file_name} <span className="text-xs text-slate-500">· {(Number(r.size_bytes ?? 0) / 1048576).toFixed(1)} MB</span></div>
                    {signed[i]?.signedUrl && <audio controls preload="none" src={signed[i].signedUrl} className="mt-1 w-full" />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">Emails</h2>
            {!emails?.length ? <p className="text-sm text-slate-500">No emails sent for this lead yet.</p> : (
              <ul className="divide-y divide-slate-100 text-sm">
                {emails.map((e) => (
                  <li key={e.id} className="py-2">
                    <Badge className={e.status === "sent" ? statusTone("Pass") : statusTone("Decline")}>{e.status}</Badge>{" "}
                    {e.subject} → {e.to_emails.join(", ")}{e.with_recording ? " · with recording" : ""}
                    <div className="text-xs text-slate-500">{dt(e.created_at)}{e.error ? ` · ${e.error}` : ""}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card p-4">
            <h2 className="mb-2 font-semibold">History and notes</h2>
            <form action={addNote.bind(null, id)} className="mb-3 flex gap-2">
              <input name="note" placeholder="Add a note for the team" className="field-input" aria-label="Note" />
              <button className="btn-secondary">Add</button>
            </form>
            <ol className="space-y-2 text-sm">
              {(events ?? []).map((e) => {
                const who = (e.actor as unknown as { full_name: string } | null)?.full_name ?? "System";
                return (
                  <li key={e.id} className="border-l-2 border-slate-200 pl-3">
                    <div>
                      {e.kind === "status_change" ? <>Status: {e.from_status} → <b>{e.to_status}</b></>
                        : e.kind === "created" ? <>Lead submitted</> : e.note}
                    </div>
                    <div className="text-xs text-slate-500">{who} · {dt(e.created_at)}</div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
