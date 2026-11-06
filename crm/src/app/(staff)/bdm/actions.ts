"use server";

import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function setBdmBonus(managerId: string, month: string, form: FormData) {
  const me = await requireProfile(["owner"]);
  const raw = String(form.get("amount") ?? "").trim();
  const note = String(form.get("note") ?? "").trim().slice(0, 500) || null;
  const supabase = await createClient();
  let error;
  if (raw === "") {
    ({ error } = await supabase.from("bdm_bonuses").delete().eq("manager_id", managerId).eq("month", `${month}-01`));
  } else {
    const amount = Number(raw);
    if (!(amount >= 0)) redirect(`/bdm?month=${month}&err=${encodeURIComponent("Bonus must be a number.")}`);
    ({ error } = await supabase.from("bdm_bonuses").upsert(
      { manager_id: managerId, month: `${month}-01`, amount, note, created_by: me.id }, { onConflict: "manager_id,month" }));
  }
  redirect(`/bdm?month=${month}&${error ? "err=" + encodeURIComponent("Could not save.") : "ok=" + encodeURIComponent("Bonus saved.")}`);
}
