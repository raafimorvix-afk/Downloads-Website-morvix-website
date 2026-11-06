import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sendMail, siteUrl, systemFrom } from "@/lib/email";

const roleText = { owner: "an Owner", manager: "a Manager", agent: "an Agent" } as const;

/** Creates a fresh one-time link and emails it. Returns the link so the owner can share it by hand if email fails. */
export async function sendInvite(userId: string, inviterName: string): Promise<{ link: string; emailed: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invite", { p_user: userId });
  if (error || !token) return { link: "", emailed: false, error: "Could not create the invite link." };
  const { data: p } = await supabase.from("profiles").select("full_name, email, role, shift:shifts(name, from_email)").eq("id", userId).single();
  const link = `${siteUrl()}/welcome?token=${token}`;
  const shift = p?.shift as unknown as { name: string; from_email: string | null } | null;
  const first = (p?.full_name ?? "").split(" ")[0] || "there";
  try {
    await sendMail({
      from: systemFrom(shift?.from_email), fromName: `${inviterName} · Morvix LLC`,
      to: [p!.email], subject: "Your Morvix CRM account",
      text: `Hello ${first},

${inviterName} has added you to the Morvix CRM as ${roleText[p!.role as keyof typeof roleText]}${shift ? ` (${shift.name})` : ""}.

Open this link to set your password and sign in:
${link}

The link works once and expires in 7 days. Your sign-in email is ${p!.email}.
After that, sign in any time at ${siteUrl()}/login

If you did not expect this email, you can ignore it.

Morvix LLC`,
    });
    return { link, emailed: true };
  } catch (e) {
    return { link, emailed: false, error: e instanceof Error ? e.message : "Email failed" };
  }
}
