import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { WelcomeForm } from "./welcome-form";

export const metadata: Metadata = { title: "Set your password" };

export default async function Welcome({ searchParams }: PageProps<"/welcome">) {
  await connection();
  const sp = await searchParams;
  const token = typeof sp.token === "string" ? sp.token : "";
  const supabase = await createClient();
  const { data } = token ? await supabase.rpc("invite_info", { p_token: token }) : { data: null };
  const who = (data as { full_name: string; email: string; role: string }[] | null)?.[0];
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="Morvix" width={64} height={64} className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-semibold">Welcome to Morvix CRM</h1>
        </div>
        {who ? (
          <>
            <p className="mb-4 text-center text-sm text-slate-600">Hi {who.full_name.split(" ")[0]}, choose a password for <b>{who.email}</b>.</p>
            <WelcomeForm token={token} email={who.email} />
          </>
        ) : (
          <div className="card p-6 text-center text-sm text-slate-600">
            This link has expired or was already used. Ask an owner to send you a new one, or <Link href="/login" className="text-brand-700 underline">sign in</Link>.
          </div>
        )}
      </div>
    </main>
  );
}
