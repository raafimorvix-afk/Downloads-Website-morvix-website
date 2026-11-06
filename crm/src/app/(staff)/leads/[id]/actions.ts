"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STATUSES, INVOICE_STATUSES } from "@/lib/leads";
import { zonedToUtc } from "@/lib/format";
import { fillTemplate, longAppt, sendMail, shortAppt, type MailAttachment } from "@/lib/email";

const back = (id: string, msg: { ok?: string; err?: string }) =>
  redirect(`/leads/${id}?${new URLSearchParams(msg as Record<string, string>)}`);
const val = (f: FormData, k: string) => {
  const v = String(f.get(k) ?? "").trim();
  return v === "" ? null : v.slice(0, 5000);
};

async function note(leadId: string, kind: string, text: string, actor: string) {
  const supabase = await createClient();
  await supabase.from("lead_events").insert({ lead_id: leadId, actor_id: actor, kind, note: text });
}

export async function qaDecision(id: string, decision: "approve" | "reject", form: FormData) {
  const me = await requireProfile(["owner", "manager"]);
  const supabase = await createClient();
  const reason = val(form, "reason");
  const { error, count } = await supabase.from("leads").update({
    status: decision === "approve" ? "QA Approved – Send to Client" : "QA Rejected",
    qa_by: me.id, qa_at: new Date().toISOString(),
    ...(decision === "reject" && reason ? { client_feedback: reason } : {}),
  }, { count: "exact" }).eq("id", id);
  if (error || !count) back(id, { err: "Could not update the lead." });
  back(id, { ok: decision === "approve" ? "Approved. Now pick the client to send it to." : "Marked as QA Rejected." });
}

export async function saveStatus(id: string, form: FormData) {
  await requireProfile(["owner", "manager"]);
  const status = val(form, "status");
  if (!status || !(STATUSES as readonly string[]).includes(status)) back(id, { err: "Choose a status." });
  const local = val(form, "appt_local"), tz = val(form, "appt_timezone");
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({
    status, client_feedback: val(form, "client_feedback"),
    ...(local && tz ? { appt_at: zonedToUtc(local, tz), appt_timezone: tz } : {}),
  }).eq("id", id);
  if (error) back(id, { err: "Could not save the status." });
  back(id, { ok: "Status saved." });
}

export async function saveBilling(id: string, form: FormData) {
  await requireProfile(["owner", "manager"]);
  const inv = val(form, "invoice_status") ?? "Not Invoiced";
  if (!(INVOICE_STATUSES as readonly string[]).includes(inv)) back(id, { err: "Choose an invoice status." });
  const price = val(form, "price");
  if (price !== null && !(Number(price) >= 0)) back(id, { err: "Price must be a number." });
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update({
    price: price === null ? null : Number(price), invoice_status: inv,
    invoice_number: val(form, "invoice_number"), invoiced_at: val(form, "invoiced_at"), paid_at: val(form, "paid_at"),
  }).eq("id", id);
  if (error) back(id, { err: "Could not save billing." });
  back(id, { ok: "Billing saved." });
}

const DETAIL_FIELDS = ["company", "business_type", "facility_size", "street", "city", "state", "zip", "country",
  "contact_name", "contact_designation", "phone", "email", "current_type", "current_provider", "frequency",
  "preferences", "agent_notes"] as const;

export async function saveDetails(id: string, form: FormData) {
  await requireProfile(["owner", "manager"]);
  const patch: Record<string, string | null> = {};
  for (const f of DETAIL_FIELDS) patch[f] = val(form, f);
  if (!patch.company) back(id, { err: "Company name is required." });
  patch.campaign_id = val(form, "campaign_id");
  const supabase = await createClient();
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) back(id, { err: "Could not save the details." });
  back(id, { ok: "Details saved." });
}

export async function addNote(id: string, form: FormData) {
  const me = await requireProfile(["owner", "manager"]);
  const text = val(form, "note");
  if (!text) back(id, { err: "Write a note first." });
  await note(id, "note", text!, me.id);
  back(id, { ok: "Note added." });
}

/** Pick the client: marks the lead Sent to Client and (if the client is set to receive emails) emails it. */
export async function sendToClient(id: string, form: FormData) {
  const me = await requireProfile(["owner", "manager"]);
  const clientId = val(form, "client_id");
  if (!clientId) back(id, { err: "Choose a client." });
  const supabase = await createClient();
  const { data: client } = await supabase.from("clients").select("id, default_price, auto_send_leads, company").eq("id", clientId!).maybeSingle();
  if (!client) back(id, { err: "Client not found in your shift." });
  const { data: lead } = await supabase.from("leads").select("price").eq("id", id).maybeSingle();
  const priceIn = val(form, "price");
  const { error } = await supabase.from("leads").update({
    client_id: clientId, status: "Sent to Client", sent_at: new Date().toISOString(),
    price: priceIn !== null ? Number(priceIn) : lead?.price ?? client!.default_price,
  }).eq("id", id);
  if (error) back(id, { err: "Could not send the lead." });
  await note(id, "sent", `Sent to ${client!.company}`, me.id);

  if (!client!.auto_send_leads) back(id, { ok: `Sent to ${client!.company}. Automatic email is off for this client.` });
  const result = await emailLead(id, me.id, me.full_name);
  back(id, result.ok ? { ok: `Sent to ${client!.company} and emailed (${result.detail}).` }
    : { err: `Lead marked as sent, but the email failed: ${result.detail}` });
}

export async function resendEmail(id: string) {
  const me = await requireProfile(["owner", "manager"]);
  const r = await emailLead(id, me.id, me.full_name);
  back(id, r.ok ? { ok: `Email sent (${r.detail}).` } : { err: `Email failed: ${r.detail}` });
}

const ATTACH_LIMIT = 15 * 1024 * 1024; // larger recordings are sent as download links instead

async function emailLead(leadId: string, actorId: string, senderName: string): Promise<{ ok: boolean; detail: string }> {
  const supabase = await createClient();
  const { data: l } = await supabase.from("leads")
    .select("*, client:clients(*), shift:shifts(from_email), recordings:lead_recordings(storage_path, file_name, size_bytes)")
    .eq("id", leadId).maybeSingle();
  if (!l?.client) return { ok: false, detail: "no client on this lead" };
  const c = l.client;
  const to = [c.email].filter(Boolean) as string[];
  if (!to.length) return { ok: false, detail: `${c.company} has no email address` };
  const from = l.shift?.from_email;
  if (!from) return { ok: false, detail: "this shift has no sending address" };

  const { data: tpls } = await supabase.from("email_templates").select("subject, body, shift_id, is_default")
    .or(`shift_id.is.null,shift_id.eq.${l.shift_id}`).eq("is_default", true);
  const tpl = tpls?.find((t) => t.shift_id === l.shift_id) ?? tpls?.[0];
  if (!tpl) return { ok: false, detail: "no email template" };

  const address = [l.street, l.city, [l.state, l.zip].filter(Boolean).join(" "), l.country].filter(Boolean).join(", ");
  const values = {
    client_first_name: (c.contact_name ?? "").split(" ")[0] || "there",
    company: l.company, business_type: l.business_type, address,
    contact_name: l.contact_name, contact_designation: l.contact_designation, phone: l.phone, email: l.email,
    current_type: l.current_type, frequency: l.frequency, preferences: l.preferences, facility_size: l.facility_size,
    appt_date_long: longAppt(l.appt_at, l.appt_timezone), appt_date_short: shortAppt(l.appt_at, l.appt_timezone),
    agent_notes: l.agent_notes, sender_name: senderName,
  };
  let text = fillTemplate(tpl.body, values);
  const subject = fillTemplate(tpl.subject, values);

  const attachments: MailAttachment[] = [];
  const recs = (l.recordings ?? []) as { storage_path: string; file_name: string; size_bytes: number | null }[];
  let mode = "no recording";
  if (c.send_recordings && recs.length) {
    const total = recs.reduce((a, r) => a + Number(r.size_bytes ?? 0), 0);
    if (total <= ATTACH_LIMIT) {
      for (const r of recs) {
        const { data } = await supabase.storage.from("recordings").download(r.storage_path);
        if (data) attachments.push({ filename: r.file_name, content: Buffer.from(await data.arrayBuffer()), contentType: data.type });
      }
      mode = `${attachments.length} recording attached`;
    } else {
      const links: string[] = [];
      for (const r of recs) {
        const { data } = await supabase.storage.from("recordings").createSignedUrl(r.storage_path, 7 * 24 * 3600);
        if (data) links.push(`${r.file_name}: ${data.signedUrl}`);
      }
      text += `\n\nCall recording (link works for 7 days):\n${links.join("\n")}`;
      mode = "recording link included";
    }
  }

  let status: "sent" | "failed" = "sent", errMsg: string | null = null;
  try {
    await sendMail({ from, to, cc: c.cc_emails ?? [], subject, text, attachments });
  } catch (e) {
    status = "failed";
    errMsg = e instanceof Error ? e.message : "unknown error";
  }
  await supabase.from("email_log").insert({
    shift_id: l.shift_id, lead_id: l.id, client_id: c.id, to_emails: [...to, ...(c.cc_emails ?? [])], subject,
    kind: "lead_to_client", with_recording: mode !== "no recording", status, error: errMsg, sent_by: actorId,
  });
  return status === "sent" ? { ok: true, detail: `to ${to.join(", ")}, ${mode}` } : { ok: false, detail: errMsg! };
}
