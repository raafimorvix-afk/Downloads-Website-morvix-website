"use client";

import { useActionState, useState } from "react";
import { submitFeedback } from "./actions";

const OPTIONS = [
  { v: "pass", label: "Interested / it's a fit", icon: "✓", cls: "peer-checked:border-emerald-600 peer-checked:bg-emerald-50" },
  { v: "decline", label: "Not a fit", icon: "✕", cls: "peer-checked:border-red-600 peer-checked:bg-red-50" },
  { v: "reschedule", label: "Need to reschedule", icon: "↻", cls: "peer-checked:border-amber-500 peer-checked:bg-amber-50" },
];

export function FeedbackForm({ token, preset }: { token: string; preset: string }) {
  const [state, action, pending] = useActionState(submitFeedback.bind(null, token), null);
  const [choice, setChoice] = useState(preset);
  if (state?.ok) return <p className="mt-5 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-800">{state.msg}</p>;
  return (
    <form action={action} className="mt-5 space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">How did the visit go?</legend>
        {OPTIONS.map((o) => (
          <label key={o.v} className="block cursor-pointer">
            <input type="radio" name="result" value={o.v} checked={choice === o.v} onChange={() => setChoice(o.v)} className="peer sr-only" />
            <span className={`flex items-center gap-3 rounded-lg border-2 border-slate-200 px-4 py-3 text-sm font-medium ${o.cls} peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500`}>
              <span aria-hidden="true" className="text-lg">{o.icon}</span>{o.label}
            </span>
          </label>
        ))}
      </fieldset>
      <div>
        <label htmlFor="note" className="field-label">Anything we should know? (optional)</label>
        <textarea id="note" name="note" rows={3} className="field-input" placeholder={choice === "reschedule" ? "A good new day and time" : "Short note"} />
      </div>
      {state && !state.ok && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.msg}</p>}
      <button className="btn-primary w-full" disabled={pending || !choice}>{pending ? "Sending…" : "Send"}</button>
    </form>
  );
}
