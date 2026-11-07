import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-black.png" alt="Morvix" width={64} height={64} className="mx-auto mb-3 h-16 w-16" />
          <h1 className="text-2xl font-semibold">Morvix CRM</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with the login your manager gave you.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
