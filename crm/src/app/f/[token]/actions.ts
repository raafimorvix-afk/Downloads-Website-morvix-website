"use server";

import { createClient } from "@/lib/supabase/server";

export async function submitFeedback(token: string, _prev: { ok: boolean; msg: string } | null, form: FormData) {
  const result = String(form.get("result") ?? "");
  if (!["pass", "decline", "reschedule"].includes(result)) return { ok: false, msg: "Please choose one of the options." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("feedback_submit", { p_token: token, p_result: result, p_note: String(form.get("note") ?? "").slice(0, 2000) });
  if (error) return { ok: false, msg: /already have/.test(error.message) ? error.message : "Something went wrong. Please reply to our email instead." };
  return { ok: true, msg: data === "Rebook – Needs New Date" ? "Thanks! Our team will contact you to set a new date." : "Thank you, your feedback was saved." };
}
