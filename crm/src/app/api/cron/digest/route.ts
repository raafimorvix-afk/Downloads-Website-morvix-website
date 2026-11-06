import { anonClient } from "@/lib/supabase/anon";
import { sendMail, siteUrl } from "@/lib/email";
import { ACTIONS } from "@/lib/leads";

type Digest = {
  shift: string; from_email: string | null; to: string[];
  actions: Record<string, number>; overdue: { code: string; company: string; appt_at: string }[];
  yesterday: { submitted: number; passes: number; declines: number };
}[];

// Runs daily (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { data, error } = await anonClient().rpc("server_digest", { p_secret: process.env.SERVER_SECRET ?? "" });
  if (error) return Response.json({ ok: false, error: "digest query failed" }, { status: 500 });
  const results: { shift: string; sent: boolean; error?: string }[] = [];
  const date = new Date().toLocaleDateString("en-US", { timeZone: "Asia/Dhaka", weekday: "long", month: "long", day: "numeric" });
  for (const s of (data ?? []) as Digest) {
    if (!s.from_email || !s.to.length) { results.push({ shift: s.shift, sent: false, error: "no sender or recipients" }); continue; }
    const lines = ACTIONS.filter((a) => s.actions[a.key]).map((a) => `  • ${a.key}: ${s.actions[a.key]}`);
    const overdue = s.overdue.map((o) => `  • ${o.code} ${o.company}`);
    const text = `Good morning,

${s.shift} – ${date}

Last 24 hours: ${s.yesterday.submitted} new leads, ${s.yesterday.passes} passed, ${s.yesterday.declines} declined.

To do today:
${lines.length ? lines.join("\n") : "  Nothing waiting. Nice work."}
${overdue.length ? `\nFeedback overdue (chase these first):\n${overdue.join("\n")}\n` : ""}
Open the dashboard: ${siteUrl()}/dashboard

Morvix CRM`;
    try {
      await sendMail({ from: s.from_email, fromName: "Morvix CRM", to: s.to, subject: `Daily summary – ${s.shift} – ${date}`, text });
      results.push({ shift: s.shift, sent: true });
    } catch (e) {
      results.push({ shift: s.shift, sent: false, error: e instanceof Error ? e.message : "send failed" });
    }
  }
  return Response.json({ ok: true, results });
}
