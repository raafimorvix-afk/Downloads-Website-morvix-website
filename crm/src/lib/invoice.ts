import "server-only";
import { createClient } from "@/lib/supabase/server";
import { invoicePdf } from "@/lib/invoice-pdf";

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "");

/** Builds the PDF for one payment link (as the signed-in user, so shift rules apply). null if not visible. */
export async function buildInvoice(linkId: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("payment_links")
    .select("id, invoice_no, amount, currency, description, url, created_at, due_date, lead_ids, client:clients(company, contact_name, email, phone), shift:shifts(from_email)")
    .eq("id", linkId).maybeSingle();
  if (!p) return null;
  const client = p.client as unknown as { company: string; contact_name: string | null; email: string | null; phone: string | null };
  const shift = p.shift as unknown as { from_email: string | null } | null;
  let items: { description: string; detail?: string; amount: number }[] = [];
  if (p.lead_ids?.length) {
    const { data: leads } = await supabase.from("leads").select("code, company, city, state, appt_at, price").in("id", p.lead_ids).order("appt_at");
    items = (leads ?? []).map((l) => ({
      description: `Appointment: ${l.company}`,
      detail: [l.code, [l.city, l.state].filter(Boolean).join(", "), l.appt_at ? `visit ${day(l.appt_at)}` : ""].filter(Boolean).join(" · "),
      amount: Number(l.price ?? 0),
    }));
  }
  if (!items.length) items = [{ description: p.description || "Appointment setting services", amount: Number(p.amount) }];
  const number = `MVX-INV-${String(p.invoice_no).padStart(4, "0")}`;
  const pdf = await invoicePdf({
    number, date: day(p.created_at), dueDate: day(p.due_date ?? p.created_at), currency: p.currency,
    billTo: { company: client.company, contact: client.contact_name, email: client.email, phone: client.phone },
    items, total: Number(p.amount), payUrl: p.url ?? "", note: p.description ?? undefined,
    from: { name: "Morvix LLC", email: shift?.from_email || "info@wearemorvix.com", website: "wearemorvix.com" },
  });
  return { pdf, number };
}
