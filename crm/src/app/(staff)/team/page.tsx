import type { Metadata } from "next";
import { randomBytes } from "node:crypto";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getShifts } from "@/lib/shifts";
import { Field, Flash, PageHeader } from "@/components/ui";
import { addStaff, resetPassword, updateStaff } from "./actions";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage({ searchParams }: PageProps<"/team">) {
  const me = await requireProfile(["owner"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: people }, shifts] = await Promise.all([
    supabase.from("profiles").select("id, full_name, email, role, shift_id, active, aliases").order("role").order("full_name"),
    getShifts(),
  ]);
  const suggested = randomBytes(9).toString("base64url");
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

  return (
    <div className="space-y-5">
      <PageHeader title="Team and logins" sub="Only owners see this page. Managers see their own shift only; agents only submit leads and see their results." />
      <Flash ok={sp.ok} err={sp.err} />

      <section className="card p-4">
        <h2 className="mb-3 font-semibold">Add a person</h2>
        <form action={addStaff} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
          <Field label="Full name" span={2}><input name="full_name" required className="field-input" /></Field>
          <Field label="Email (their login)" span={2}><input name="email" type="email" required className="field-input" /></Field>
          <Field label="Starting password" span={2}><input name="password" required minLength={8} defaultValue={suggested} className="field-input font-mono" /></Field>
          <Field label="Role" span={2}>{roleSelect()}</Field>
          <Field label="Shift" span={2}>{shiftSelect(null)}</Field>
          <div className="flex items-end sm:col-span-2"><button className="btn-primary w-full">Create login</button></div>
        </form>
        <p className="mt-2 text-xs text-slate-500">Copy the password before you click Create, then send it to the person privately. No email is sent.</p>
      </section>

      <section className="card divide-y divide-slate-100">
        {(people ?? []).map((p) => (
          <details key={p.id} className="group p-4">
            <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2">
              <span>
                <span className="font-medium">{p.full_name}</span> <span className="text-sm text-slate-500">{p.email}</span>
                {!p.active && <span className="ml-2 text-xs text-red-700">inactive</span>}
              </span>
              <span className="text-sm text-slate-600">
                {p.role === "owner" ? "Owner" : p.role === "manager" ? "Manager / BDM" : "Agent"}
                {p.shift_id ? ` · ${shifts.find((s) => s.id === p.shift_id)?.name}` : ""}
              </span>
            </summary>
            <div className="mt-3 grid gap-4 lg:grid-cols-3">
              <form action={updateStaff.bind(null, p.id)} className="grid grid-cols-2 gap-3 lg:col-span-2">
                <Field label="Name"><input name="full_name" defaultValue={p.full_name} className="field-input" /></Field>
                <Field label="Role">{roleSelect(p.role)}</Field>
                <Field label="Shift">{shiftSelect(p.shift_id)}</Field>
                <Field label="Old form names (comma separated)"><input name="aliases" defaultValue={(p.aliases ?? []).join(", ")} placeholder="Luis, Luis T" className="field-input" /></Field>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p.active} /> Can sign in</label>
                <div className="flex justify-end"><button className="btn-secondary">Save</button></div>
              </form>
              <form action={resetPassword.bind(null, p.id)} className="space-y-2">
                <Field label="New password"><input name="password" minLength={8} required defaultValue={suggested} className="field-input font-mono" /></Field>
                <button className="btn-secondary w-full">Reset password</button>
              </form>
            </div>
            {p.id === me.id && <p className="mt-2 text-xs text-slate-500">This is you.</p>}
          </details>
        ))}
      </section>
    </div>
  );
}
