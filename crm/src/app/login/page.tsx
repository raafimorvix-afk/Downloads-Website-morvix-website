import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-xl font-bold text-white">
            M
          </div>
          <h1 className="text-2xl font-semibold">Morvix CRM</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in with the login your manager gave you.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
