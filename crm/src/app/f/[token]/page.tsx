import type { Metadata } from "next";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { formatAppt } from "@/lib/format";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = { title: "Appointment feedback", robots: { index: false } };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function FeedbackPage({ params, searchParams }: PageProps<"/f/[token]">) {
  await connection();
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = UUID.test(token) ? await supabase.rpc("feedback_info", { p_token: token }) : { data: null };
  const l = (data as { code: string; company: string; city: string | null; state: string | null; appt_at: string | null;
    appt_timezone: string | null; client_company: string; status: string; can_respond: boolean }[] | null)?.[0];
  const preset = ["pass", "decline", "reschedule"].includes(String(sp.r)) ? String(sp.r) : "";
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-center gap-2 font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="" width={40} height={40} className="h-10 w-10" />Morvix LLC
        </div>
        {!l ? (
          <div className="card p-6 text-center text-sm text-slate-600">This link isn&apos;t valid. Please reply to the email instead.</div>
        ) : (
          <div className="card p-6">
            <p className="text-sm text-slate-500">Appointment feedback for {l.client_company}</p>
            <h1 className="mt-1 text-xl font-semibold">{l.company}</h1>
            <p className="text-sm text-slate-600">{[l.city, l.state].filter(Boolean).join(", ")} · {formatAppt(l.appt_at, l.appt_timezone)}</p>
            {l.can_respond
              ? <FeedbackForm token={token} preset={preset} />
              : <p className="mt-5 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Thank you, we already have your answer ({l.status}). If something changed, just reply to our email.</p>}
          </div>
        )}
      </div>
    </main>
  );
}
