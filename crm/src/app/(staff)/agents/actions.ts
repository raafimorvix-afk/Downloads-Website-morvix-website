"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function addAdjustment(form: FormData) {
  const me = await requireProfile(["owner", "manager"]);
  const g = (k: string) => String(form.get(k) ?? "").trim();
  const month = g("month"), back = (m: string) => redirect(`/agents?month=${month}&${m}`);
  const amount = Number(g("amount"));
  if (!(amount > 0)) back("err=" + encodeURIComponent("Enter an amount above 0."));
  if (!g("reason")) back("err=" + encodeURIComponent("Write the reason. The agent will see it."));
  const supabase = await createClient();
  const { data: agent } = await supabase.from("profiles").select("shift_id").eq("id", g("agent_id")).maybeSingle();
  if (!agent) back("err=" + encodeURIComponent("Choose an agent."));
  const { error } = await supabase.from("agent_adjustments").insert({
    agent_id: g("agent_id"), shift_id: agent!.shift_id, month: `${month}-01`,
    kind: g("kind") === "bonus" ? "bonus" : "fine", amount, reason: g("reason").slice(0, 500), created_by: me.id,
  });
  back(error ? "err=" + encodeURIComponent("Could not save. Managers can only fine or reward agents in their own shift.") : "ok=" + encodeURIComponent("Saved. The agent can see it now."));
}

export async function removeAdjustment(id: string, month: string) {
  await requireProfile(["owner", "manager"]);
  const supabase = await createClient();
  await supabase.from("agent_adjustments").delete().eq("id", id);
  redirect(`/agents?month=${month}&ok=${encodeURIComponent("Removed.")}`);
}
