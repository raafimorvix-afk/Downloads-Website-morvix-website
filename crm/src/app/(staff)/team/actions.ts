"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { sendInvite } from "@/lib/invite";

const back = (m: Record<string, string>) => redirect(`/team?${new URLSearchParams(m)}`);
const KNOWN = /owners|valid email|at least 8|required|Choose|already has a login|not found/;

function inviteMessage(email: string, r: Awaited<ReturnType<typeof sendInvite>>, extra = ""): Record<string, string> {
  if (r.emailed) return { ok: `Invite emailed to ${email}. They set their own password from the link.${extra}` };
  return { err: `Account ready, but the invite email could not be sent (${r.error}). Send them this link yourself (works once, 7 days): ${r.link}${extra}` };
}

export async function addStaff(form: FormData) {
  const me = await requireProfile(["owner"]);
  const g = (k: string) => String(form.get(k) ?? "").trim();
  const supabase = await createClient();
  const { data: newId, error } = await supabase.rpc("create_staff", {
    p_email: g("email"), p_password: null, p_full_name: g("full_name"), p_role: g("role"), p_shift: g("shift_id") || null,
  });
  if (error) back({ err: KNOWN.test(error.message) ? error.message : "Could not create the login." });
  const aliases = g("aliases").split(",").map((a) => a.trim()).filter(Boolean);
  if (aliases.length) await supabase.from("profiles").update({ aliases }).eq("id", newId);
  const { data: linked } = await supabase.rpc("link_agent_history", { p_agent: newId });
  const r = await sendInvite(newId as string, me.full_name);
  back(inviteMessage(g("email"), r, linked ? ` Linked ${linked} past leads.` : ""));
}

export async function resendInvite(id: string, email: string) {
  const me = await requireProfile(["owner"]);
  back(inviteMessage(email, await sendInvite(id, me.full_name)));
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
  back(error ? { err: KNOWN.test(error.message) ? error.message : "Could not reset the password." } : { ok: "Password changed." });
}

/** Attach an old sheet name (e.g. "Anne Gilbert") to an agent login so their history counts. */
export async function linkOldName(name: string, form: FormData) {
  await requireProfile(["owner"]);
  const agentId = String(form.get("agent_id") ?? "");
  if (!agentId) back({ err: "Choose the agent." });
  const supabase = await createClient();
  const { data: p } = await supabase.from("profiles").select("aliases").eq("id", agentId).single();
  const aliases = Array.from(new Set([...(p?.aliases ?? []), name]));
  await supabase.from("profiles").update({ aliases }).eq("id", agentId);
  const { data: linked } = await supabase.rpc("link_agent_history", { p_agent: agentId });
  back(linked ? { ok: `Linked ${linked} leads from "${name}".` } : { err: `No leads linked. Is "${name}" in the same shift as that agent?` });
}
