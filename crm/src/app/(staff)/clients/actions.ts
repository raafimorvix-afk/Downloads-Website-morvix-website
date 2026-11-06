"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const TEXT = ["company", "industry", "contact_name", "designation", "phone", "email", "website", "timezone",
  "coverage_area", "services", "price_notes", "lead_preference", "requirements", "notes"] as const;

function read(form: FormData) {
  const v = (k: string) => { const x = String(form.get(k) ?? "").trim(); return x === "" ? null : x.slice(0, 5000); };
  const row: Record<string, unknown> = {};
  for (const k of TEXT) row[k] = v(k);
  row.status = v("status") ?? "Active";
  row.campaign_id = v("campaign_id");
  row.onboarded_by = v("onboarded_by");
  const price = v("default_price");
  row.default_price = price === null ? null : Number(price);
  row.cc_emails = (v("cc_emails") ?? "").split(/[,\s;]+/).filter((e) => e.includes("@"));
  row.auto_send_leads = form.get("auto_send_leads") === "on";
  row.send_recordings = form.get("send_recordings") === "on";
  return row;
}

function check(row: Record<string, unknown>): string | null {
  if (!row.company) return "Company name is required.";
  if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(row.email))) return "Client email looks wrong.";
  if (row.default_price !== null && !(Number(row.default_price) >= 0)) return "Price must be a number.";
  if (row.auto_send_leads && !row.email) return "Add the client's email, or turn off automatic lead emails.";
  return null;
}

export async function createClientRecord(form: FormData) {
  const me = await requireProfile(["owner", "manager"]);
  const row = read(form);
  row.shift_id = me.role === "owner" ? String(form.get("shift_id") ?? "") || null : me.shift_id;
  row.added_by = me.id;
  const err = !row.shift_id ? "Choose a shift." : check(row);
  if (err) redirect(`/clients/new?err=${encodeURIComponent(err)}`);
  const supabase = await createClient();
  const { data, error } = await supabase.from("clients").insert(row).select("id").single();
  if (error) redirect(`/clients/new?err=${encodeURIComponent("Could not save the client.")}`);
  redirect(`/clients/${data.id}?ok=${encodeURIComponent("Client added.")}`);
}

export async function updateClientRecord(id: string, form: FormData) {
  await requireProfile(["owner", "manager"]);
  const row = read(form);
  const err = check(row);
  if (err) redirect(`/clients/${id}?err=${encodeURIComponent(err)}`);
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update(row).eq("id", id);
  redirect(`/clients/${id}?${error ? "err=" + encodeURIComponent("Could not save.") : "ok=" + encodeURIComponent("Saved.")}`);
}
