"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function acceptInvite(token: string, _prev: string | null, form: FormData): Promise<string | null> {
  const pw = String(form.get("password") ?? ""), pw2 = String(form.get("password2") ?? "");
  if (pw.length < 8) return "Use at least 8 characters.";
  if (pw !== pw2) return "The two passwords don't match.";
  const supabase = await createClient();
  const { data: email, error } = await supabase.rpc("accept_invite", { p_token: token, p_password: pw });
  if (error) return /expired|used|8 characters/.test(error.message) ? error.message : "Could not save the password.";
  const { error: e2 } = await supabase.auth.signInWithPassword({ email: email as string, password: pw });
  if (e2) redirect("/login");
  redirect("/");
}
