import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

export type Role = "owner" | "manager" | "agent";
export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  shift_id: string | null;
  shift: { name: string } | null;
};

// The signed-in person's profile. Redirects to /login if signed out,
// or to /no-access if they have a login but no CRM profile (or were deactivated).
export async function requireProfile(allowed?: Role[]): Promise<Profile> {
  await connection(); // always per request, never pre-rendered
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect("/login");
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, shift_id, active, shift:shifts(name)")
    .eq("id", userId)
    .maybeSingle();
  if (!data || !data.active) redirect("/no-access");
  const profile = data as unknown as Profile;
  if (allowed && !allowed.includes(profile.role)) redirect("/");
  return profile;
}
