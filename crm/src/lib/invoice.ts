import "server-only";
import { createClient } from "@/lib/supabase/server";
import { invoicePdf } from "@/lib/invoice-pdf";

const mdy = (iso: string | null | undefined) => {
  const d = new Date(iso ?? Date.now());
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", month: "2-digit", day: "2-digit", year: "numeric" }).format(d);
};

/** Builds the PDF for one payment link (as the signed-in user, so shift rules apply). null if not visible. */
export async function buildInvoice(linkId: string) {
  const supabase = await createClient();
  const { data: p } = await supabase.from("payment_links")
    .select("id, invoice_code, invoice_no, amount, currency, description, url, created_at, lead_ids, client:clients(company, contact_name, email), shift:shifts(from_email)")
    .eq("id", linkId).maybeSingle();
  if (!p) return null;
  const client = p.client as unknown as { company: string; contact_name: string | null; email: string | null };
  const shift = p.shift as unknown as { from_email: string | null } | null;
  let items: { lead: string; location?: string; frequency?: string; amount: number }[] = [];
  if (p.lead_ids?.length) {
    const { data: leads } = await supabase.from("leads").select("company, city, state, frequency, price, appt_at").in("id", p.lead_ids).order("appt_at");
    items = (leads ?? []).map((l) => ({
      lead: l.company, location: [l.city, l.state].filter(Boolean).join(", "), frequency: l.frequency ?? undefined, amount: Number(l.price ?? 0),
    }));
  }
  if (!items.length) items = [{ lead: p.description || "Appointment setting services", amount: Number(p.amount) }];
  const number = p.invoice_code ?? `MOR-${p.invoice_no}`;
  const pdf = await invoicePdf({
    number, date: mdy(p.created_at), terms: "Due upon receipt", currency: p.currency,
    billTo: { company: client.company, contact: client.contact_name, email: client.email },
    items, total: Number(p.amount), payUrl: p.url ?? "",
    from: { name: "Morvix LLC", email: shift?.from_email || "info@wearemorvix.com", website: "wearemorvix.com" },
  });
  return { pdf, number };
}
