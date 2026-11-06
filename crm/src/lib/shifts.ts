import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/auth";

export type Shift = { id: string; name: string; from_email: string | null };

export async function getShifts(): Promise<Shift[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("shifts").select("id, name, from_email").order("name", { ascending: false });
  return data ?? [];
}

/** Owners can pick a shift with ?shift=<id> (blank = all). Managers are always locked to their own. */
export function shiftFilter(me: Profile, requested: unknown): string | null {
  if (me.role !== "owner") return me.shift_id;
  return typeof requested === "string" && requested ? requested : null;
}
