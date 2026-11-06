"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const back = (m: Record<string, string>) => redirect(`/team?${new URLSearchParams(m)}`);
const KNOWN = /owners|valid email|at least 8|required|Choose|already has a login|not found/;

export async function addStaff(form: FormData) {
  await requireProfile(["owner"]);
  const g = (k: string) => String(form.get(k) ?? "").trim();
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("create_staff", {
    p_email: g("email"), p_password: g("password"), p_full_name: g("full_name"), p_role: g("role"), p_shift: g("shift_id") || null,
  });
  if (error) back({ err: KNOWN.test(error.message) ? error.message : "Could not create the login." });
  const { data: linked } = await supabase.rpc("link_agent_history", { p_agent: newId });
  back({ ok: `Login created for ${g("email")}.${linked ? ` Linked ${linked} past leads with the same name.` : ""} Give them the password you set.` });
}

export async function updateStaff(id: string, form: FormData) {
  const me = await requireProfile(["owner"]);
  const g = (k: string) => String(form.get(k) ?? "").trim();
  const role = g("role");
  if (id === me.id && (role !== "owner" || form.get("active") !== "on")) back({ err: "You can't remove your own owner access." });
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({
    full_name: g("full_name"), role, shift_id: role === "owner" ? null : g("shift_id") || null, active: form.get("active") === "on",
    aliases: g("aliases").split(",").map((a) => a.trim()).filter(Boolean),
  }).eq("id", id);
  if (error) back({ err: "Could not save. Managers and agents need a shift." });
  const { data: linked } = await supabase.rpc("link_agent_history", { p_agent: id });
  back({ ok: linked ? `Saved. Linked ${linked} past leads to this agent.` : "Saved." });
}

export async function resetPassword(id: string, form: FormData) {
  await requireProfile(["owner"]);
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_staff_password", { p_user: id, p_password: String(form.get("password") ?? "") });
  back(error ? { err: KNOWN.test(error.message) ? error.message : "Could not reset the password." } : { ok: "Password changed. Give the new password to the person." });
}
