import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts } from "@/lib/shifts";
import { Field, Flash, PageHeader } from "@/components/ui";
import { addStaff, linkOldName, resendInvite, resetPassword, updateStaff } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireProfile(["owner"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: people }, shifts, { data: unlinked }, { data: invites }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, shift_id, active, aliases").order("role").order("full_name"),
    getShifts(),
    supabase.rpc("unlinked_agent_names"),
    supabase.from("staff_invites").select("user_id, used_at, expires_at").order("created_at", { ascending: false }),
  ]);
  const inviteState = new Map<string, string>();
  for (const i of invites ?? []) if (!inviteState.has(i.user_id))
    inviteState.set(i.user_id, i.used_at ? "joined" : new Date(i.expires_at) < new Date() ? "expired" : "invited");
  const agents = (people ?? []).filter((p) => p.role === "agent" && p.active);
  const shiftName = (id: string | null) => shifts.find((s) => s.id === id)?.name;
  const shiftSelect = (value: string | null) => (
    <select name="shift_id" defaultValue={value ?? ""} className="field-input" aria-label="Shift">
      <option value="">No shift (owners)</option>
      {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const roleSelect = (value = "agent") => (
    <select name="role" defaultValue={value} className="field-input" aria-label="Role">
      <option value="agent">Agent</option><option value="manager">Manager / BDM</option><option value="owner">Owner</option>
    </select>
  );
  const badge = (s?: string) => s === "joined" ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 ring-1 ring-emerald-200">Joined</span>
    : s === "invited" ? <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200">Invite sent</span>
    : s === "expired" ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700 ring-1 ring-red-200">Invite expired</span> : null;

  return (
    <div className="space-y-5">
      <PageHeader title="Team and logins" sub="Owners only. New people get an email with a link to set their own password." />
      <Flash ok={sp.ok} err={sp.err} />

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Add a person</h2>
        <form action={addStaff} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="Full name" span={2}><input name="full_name" required className="field-input" /></Field>
          <Field label="Email (they sign in with it)" span={2}><input name="email" type="email" required className="field-input" /></Field>
          <Field label="Role">{roleSelect()}</Field>
          <Field label="Shift">{shiftSelect(null)}</Field>
          <Field label="Names used in old sheets (agents, optional)" span={3}>
            <input name="aliases" placeholder="e.g. Anne Gilbert, Anne" className="field-input" />
          </Field>
          <div className="flex items-end sm:col-span-3"><button className="btn-primary w-full">Create and email invite</button></div>
        </form>
        <p className="mt-2 text-xs text-slate-500">The invite comes from the shift&apos;s mailbox (owners: info@). The link works once and expires after 7 days; you can resend it any time.</p>
      </section>

      {(unlinked ?? []).length > 0 && (
        <section className="card p-4">
          <h2 className="font-semibold">Old sheet names not linked to anyone</h2>
          <p className="mb-3 text-sm text-slate-500">These names from the imported sheets don&apos;t match an agent login, so their leads don&apos;t count for anyone yet. Pick the agent each one belongs to.</p>
          <ul className="divide-y divide-slate-100">
            {(unlinked as { shift_id: string; shift_name: string; name: string; leads: number }[]).map((u) => (
              <li key={u.shift_id + u.name} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <span className="min-w-40 font-medium">{u.name}</span>
                <span className="text-slate-500">{u.leads} leads · {u.shift_name}</span>
                <form action={linkOldName.bind(null, u.name)} className="ml-auto flex gap-2">
                  <select name="agent_id" className="field-input w-48" defaultValue="" aria-label={`Agent for ${u.name}`}>
                    <option value="">Choose agent…</option>
                    {agents.filter((a) => a.shift_id === u.shift_id).map((a) => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                  </select>
                  <button className="btn-secondary">Link</button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card divide-y divide-slate-100">
        {(people ?? []).map((p) => (
          <details key={p.id} className="group p-4">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{p.full_name}</span> <span className="text-sm text-slate-500">{p.email}</span>
                {badge(inviteState.get(p.id))}
                {!p.active && <span className="text-xs text-red-700">inactive</span>}
              </span>
              <span className="text-sm text-slate-600">
                {p.role === "owner" ? "Owner" : p.role === "manager" ? "Manager / BDM" : "Agent"}{p.shift_id ? ` · ${shiftName(p.shift_id)}` : ""}
              </span>
            </summary>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              <form action={updateStaff.bind(null, p.id)} className="grid grid-cols-2 gap-3 lg:col-span-2">
                <Field label="Name"><input name="full_name" defaultValue={p.full_name} className="field-input" /></Field>
                <Field label="Role">{roleSelect(p.role)}</Field>
                <Field label="Shift">{shiftSelect(p.shift_id)}</Field>
                <Field label="Names used in old sheets"><input name="aliases" defaultValue={(p.aliases ?? []).join(", ")} placeholder="Anne Gilbert, Anne" className="field-input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} /> Can sign in</label>
                <div className="flex justify-end"><button className="btn-secondary">Save</button></div>
              </form>
              <div className="space-y-3">
                {p.id !== me.id && (
                  <form action={resendInvite.bind(null, p.id, p.email)}>
                    <button className="btn-primary w-full">Email a new sign-in link</button>
                  </form>
                )}
                <form action={resetPassword.bind(null, p.id)} className="space-y-2">
                  <Field label={p.id === me.id ? "Change my password" : "Or set a password yourself"}>
                    <input name="password" type="password" minLength={8} required autoComplete="new-password" className="field-input" />
                  </Field>
                  <button className="btn-secondary w-full">Save password</button>
                </form>
              </div>
            </div>
          </details>
        ))}
      </section>
    </div>
  );
}
