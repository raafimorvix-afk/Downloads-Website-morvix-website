"use client";

import { useActionState } from "react";
import { acceptInvite } from "./actions";

export function WelcomeForm({ token, email }: { token: string; email: string }) {
  const [error, action, pending] = useActionState(acceptInvite.bind(null, token), null);
  return (
    <form action={action} className="card space-y-4 p-6">
      <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
      <div>
        <label htmlFor="password" className="field-label">New password</label>
        <input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" className="field-input" />
      </div>
      <div>
        <label htmlFor="password2" className="field-label">Type it again</label>
        <input id="password2" name="password2" type="password" minLength={8} required autoComplete="new-password" className="field-input" />
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Saving…" : "Save and sign in"}</button>
    </form>
  );
}
