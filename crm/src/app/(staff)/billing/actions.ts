"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe";
import { sendMail } from "@/lib/email";
import { paymentEmailHtml } from "@/lib/email-html";
import { buildInvoice } from "@/lib/invoice";

const back = (m: Record<string, string>) => redirect(`/billing?${new URLSearchParams(m)}`);
const invoiceNo = (n: number) => `MVX-INV-${String(n).padStart(4, "0")}`;
const fmt = (n: number, cur: string) => new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(n);

/**
 * Creates one Stripe payment link for a client: either for the selected passed leads (their prices are added up)
 * or for a custom amount. Leads become "Invoiced"; the Stripe webhook marks them "Paid" when the client pays.
 */
export async function createPaymentLink(form: FormData) {
  const me = await requireProfile(["owner", "manager"]);
  const s = stripe();
  if (!s) back({ err: "Stripe is not connected yet. Add the Stripe key in Vercel first (see the box at the top)." });
  const clientId = String(form.get("client_id") ?? "");
  const leadIds = form.getAll("lead_id").map(String).filter(Boolean);
  const custom = Number(form.get("amount") || 0);
  const note = String(form.get("description") ?? "").trim().slice(0, 200);
  const emailIt = form.get("email_client") === "on";

  const supabase = await createClient();
  const { data: client } = await supabase.from("clients")
    .select("id, company, email, cc_emails, contact_name, currency, shift_id, shift:shifts(from_email)").eq("id", clientId).maybeSingle();
  if (!client) back({ err: "Choose a client." });
  let amount = custom, leads: { id: string; code: string; company: string; price: number }[] = [];
  if (leadIds.length) {
    const { data } = await supabase.from("leads").select("id, code, company, price")
      .in("id", leadIds).eq("client_id", clientId).eq("status", "Pass").eq("invoice_status", "Not Invoiced");
    leads = (data ?? []) as typeof leads;
    if (leads.some((l) => !(Number(l.price) > 0))) back({ err: "Some selected leads have no price. Set the price on those leads first." });
    amount = leads.reduce((a, l) => a + Number(l.price), 0);
  }
  if (!(amount >= 1)) back({ err: "Select passed leads or enter an amount of at least 1." });
  const currency = client!.currency || "usd";
  const description = note || (leads.length ? `${leads.length} appointment${leads.length > 1 ? "s" : ""}: ${leads.map((l) => l.code).join(", ")}` : "Appointment setting services");

  const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const { data: row, error } = await supabase.from("payment_links").insert({
    shift_id: client!.shift_id, client_id: clientId, amount, currency, description, lead_ids: leads.map((l) => l.id), created_by: me.id, due_date: due,
  }).select("id, invoice_no").single();
  if (error || !row) back({ err: "Could not save the payment link." });

  let url = "";
  try {
    const price = await s!.prices.create({
      currency, unit_amount: Math.round(amount * 100),
      product_data: { name: `Morvix LLC – ${client!.company}` },
    });
    const link = await s!.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { morvix_link_id: row!.id, client: client!.company.slice(0, 100) },
      payment_intent_data: { description: `Morvix LLC – ${description}`.slice(0, 500) },
      after_completion: { type: "hosted_confirmation", hosted_confirmation: { custom_message: "Thank you! Morvix LLC has received your payment." } },
    });
    url = link.url;
    await supabase.from("payment_links").update({ stripe_link_id: link.id, url }).eq("id", row!.id);
  } catch (e) {
    await supabase.from("payment_links").update({ status: "Cancelled" }).eq("id", row!.id);
    back({ err: `Stripe refused: ${e instanceof Error ? e.message : "unknown error"}` });
  }
  if (leads.length) {
    await supabase.from("leads").update({ payment_link_id: row!.id, invoice_status: "Invoiced", invoiced_at: new Date().toISOString().slice(0, 10), invoice_number: invoiceNo(row!.invoice_no) })
      .in("id", leads.map((l) => l.id));
  }

  let mailNote = "";
  if (emailIt) {
    const from = (client!.shift as unknown as { from_email: string | null } | null)?.from_email;
    if (!client!.email || !from) mailNote = " Not emailed: the client has no email address.";
    else {
      try {
        const inv = await buildInvoice(row!.id);
        await sendMail({
          from, to: [client!.email], cc: client!.cc_emails ?? [],
          subject: `Invoice ${invoiceNo(row!.invoice_no)} from Morvix LLC – ${fmt(amount, currency)}`,
          text: `Hello ${(client!.contact_name ?? "").split(" ")[0] || "there"},

Please find attached invoice ${invoiceNo(row!.invoice_no)} for ${description}.

Amount: ${fmt(amount, currency)}
Pay securely by card here:
${url}

Thank you for working with us.

${me.full_name}
Morvix LLC`,
          html: paymentEmailHtml({
            greeting: `Hello ${(client!.contact_name ?? "").split(" ")[0] || "there"},`,
            intro: `Please find attached invoice ${invoiceNo(row!.invoice_no)} for ${description}. You can pay securely by card with the button below.`,
            amount: fmt(amount, currency), invoiceNo: invoiceNo(row!.invoice_no),
            lines: leads.map((l) => `${l.code} · ${l.company} – ${fmt(Number(l.price), currency)}`),
            payUrl: url, sender: me.full_name,
          }),
          attachments: inv ? [{ filename: `${invoiceNo(row!.invoice_no)}.pdf`, content: Buffer.from(inv.pdf), contentType: "application/pdf" }] : [],
        });
        await supabase.from("payment_links").update({ emailed_at: new Date().toISOString() }).eq("id", row!.id);
        mailNote = ` Emailed to ${client!.email}.`;
      } catch (e) {
        mailNote = ` Email failed (${e instanceof Error ? e.message : "error"}); copy the link instead.`;
      }
    }
  }
  back({ ok: `Payment link for ${fmt(amount, currency)} created.${mailNote}`, link: url });
}

export async function cancelPaymentLink(id: string) {
  await requireProfile(["owner", "manager"]);
  const supabase = await createClient();
  const { data: row } = await supabase.from("payment_links").select("stripe_link_id, status").eq("id", id).maybeSingle();
  if (!row || row.status !== "Open") back({ err: "Only open links can be cancelled." });
  const s = stripe();
  if (s && row!.stripe_link_id) { try { await s.paymentLinks.update(row!.stripe_link_id, { active: false }); } catch { /* already inactive */ } }
  await supabase.from("payment_links").update({ status: "Cancelled" }).eq("id", id);
  await supabase.from("leads").update({ payment_link_id: null, invoice_status: "Not Invoiced", invoiced_at: null, invoice_number: null }).eq("payment_link_id", id);
  back({ ok: "Link cancelled. Its leads are back to Not Invoiced." });
}
