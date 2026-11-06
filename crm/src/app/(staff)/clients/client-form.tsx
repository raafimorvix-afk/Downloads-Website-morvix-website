import { TIMEZONES } from "@/lib/format";
import { Field } from "@/components/ui";
import type { Shift } from "@/lib/shifts";

type C = Record<string, unknown>;

export function ClientForm({ action, client = {}, managers, campaigns, shifts, submit }: {
  action: (f: FormData) => Promise<void>; client?: C; submit: string;
  managers: { id: string; full_name: string }[]; campaigns: { id: string; name: string }[]; shifts?: Shift[];
}) {
  const v = (k: string) => (client[k] ?? "") as string;
  const tzKnown = TIMEZONES.some((g) => g.items.some((i) => i.value === v("timezone")));
  return (
    <form action={action} className="space-y-5">
      <fieldset className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Company</legend>
        {shifts && (
          <Field label="Shift *">
            <select name="shift_id" required className="field-input" defaultValue="">
              <option value="">Choose</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Company name *" span={2}><input name="company" required defaultValue={v("company")} className="field-input" /></Field>
        <Field label="Status">
          <select name="status" defaultValue={v("status") || "Active"} className="field-input">
            <option>Active</option><option>Paused</option><option>Stopped</option>
          </select>
        </Field>
        <Field label="Industry"><input name="industry" defaultValue={v("industry")} placeholder="Commercial cleaning / Solar…" className="field-input" /></Field>
        {campaigns.length > 0 && (
          <Field label="Campaign">
            <select name="campaign_id" defaultValue={v("campaign_id")} className="field-input">
              <option value="">None</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Website"><input name="website" defaultValue={v("website")} className="field-input" /></Field>
        <Field label="Coverage area" span={2}><input name="coverage_area" defaultValue={v("coverage_area")} className="field-input" /></Field>
        <Field label="Time zone">
          <select name="timezone" defaultValue={v("timezone")} className="field-input">
            <option value="">Not set</option>
            {!tzKnown && v("timezone") && <option value={v("timezone")}>{v("timezone")}</option>}
            {TIMEZONES.map((g) => <optgroup key={g.group} label={g.group}>{g.items.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</optgroup>)}
          </select>
        </Field>
        <Field label="Services" span={3}><input name="services" defaultValue={v("services")} className="field-input" /></Field>
      </fieldset>

      <fieldset className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Contact (who receives the leads)</legend>
        <Field label="Contact name"><input name="contact_name" defaultValue={v("contact_name")} className="field-input" /></Field>
        <Field label="Designation"><input name="designation" defaultValue={v("designation")} className="field-input" /></Field>
        <Field label="Phone"><input name="phone" defaultValue={v("phone")} className="field-input" /></Field>
        <Field label="Email (leads go here)"><input name="email" type="email" defaultValue={v("email")} className="field-input" /></Field>
        <Field label="CC emails (comma separated)" span={2}>
          <input name="cc_emails" defaultValue={((client.cc_emails as string[]) ?? []).join(", ")} className="field-input" />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="auto_send_leads" defaultChecked={client.auto_send_leads !== false} />
          Email the lead details automatically when a lead is sent to this client
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="send_recordings" defaultChecked={client.send_recordings === true} />
          Include the call recording in that email
        </label>
      </fieldset>

      <fieldset className="card grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
        <legend className="px-1 text-sm font-semibold">Deal</legend>
        <Field label="Default price per lead ($)"><input name="default_price" type="number" min="0" step="0.01" defaultValue={v("default_price")} className="field-input" /></Field>
        <Field label="Price as agreed (notes)"><input name="price_notes" defaultValue={v("price_notes")} placeholder="$120-$200 depending on size" className="field-input" /></Field>
        <Field label="Onboarded by (BDM)">
          <select name="onboarded_by" defaultValue={v("onboarded_by")} className="field-input">
            <option value="">Not set</option>
            {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </Field>
        <Field label="Lead preference" span={3}><input name="lead_preference" defaultValue={v("lead_preference")} placeholder="e.g. 1x week, 2000+ sq ft" className="field-input" /></Field>
        <Field label="Requirements / feedback" span={3}><textarea name="requirements" rows={2} defaultValue={v("requirements")} className="field-input" /></Field>
        <Field label="Notes" span={3}><textarea name="notes" rows={2} defaultValue={v("notes")} className="field-input" /></Field>
      </fieldset>
      <div className="flex justify-end"><button className="btn-primary px-6">{submit}</button></div>
    </form>
  );
}
