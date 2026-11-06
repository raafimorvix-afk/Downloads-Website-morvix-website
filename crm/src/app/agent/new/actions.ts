"use server";

import { createClient } from "@/lib/supabase/server";

export type SubmitResult = { ok: true; id: string; code: string; seenBefore: number } | { ok: false; error: string };

const FIELDS = [
  "campaign_id", "company", "business_type", "street", "city", "state", "zip", "country",
  "contact_name", "contact_designation", "phone", "email", "current_type", "frequency", "preferences",
  "facility_size", "current_provider", "appt_local", "appt_timezone", "agent_notes",
] as const;

export async function submitLead(input: Record<string, string>): Promise<SubmitResult> {
  const payload: Record<string, string> = {};
  for (const f of FIELDS) {
    const v = (input[f] ?? "").toString().trim();
    if (v) payload[f] = v.slice(0, 5000);
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_lead", { p: payload });
  if (error) {
    // our own validation messages are safe to show; anything else gets a generic message
    const known = /required|Choose|Not signed in/.test(error.message);
    return { ok: false, error: known ? error.message : "Could not save the lead. Please try again." };
  }
  const r = data as { id: string; code: string };
  const { data: seen } = await supabase.rpc("phone_seen_count", { p_phone: payload.phone ?? "" });
  return { ok: true, id: r.id, code: r.code, seenBefore: Math.max(0, Number(seen ?? 0) - 1) };
}

// Called after the browser uploads a recording to storage, to list it on the lead.
export async function recordUpload(leadId: string, path: string, fileName: string, size: number) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const { error } = await supabase.from("lead_recordings").insert({
    lead_id: leadId, storage_path: path, file_name: fileName.slice(0, 200), size_bytes: size,
    uploaded_by: claims?.claims?.sub,
  });
  return error ? "The file uploaded but could not be linked to the lead." : null;
}
