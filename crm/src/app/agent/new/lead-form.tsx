"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { TIMEZONES } from "@/lib/format";
import { recordUpload, submitLead } from "./actions";

const MAX_MB = 50;

type Props = { campaigns: { id: string; name: string }[]; defaultTimezone: string; defaultCountry: string };
type Done = { code: string; uploadErrors: string[]; seenBefore: number };

export function LeadForm({ campaigns, defaultTimezone, defaultCountry }: Props) {
  const formRef = useRef<HTMLFormElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const tooBig = picked.filter((f) => f.size > MAX_MB * 1024 * 1024);
    setError(tooBig.length ? `${tooBig.map((f) => f.name).join(", ")} is over ${MAX_MB} MB and was skipped.` : null);
    setFiles(picked.filter((f) => f.size <= MAX_MB * 1024 * 1024));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const data = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    delete (data as Record<string, unknown>).recordings;

    setBusy("Saving lead…");
    const res = await submitLead(data);
    if (!res.ok) { setBusy(null); setError(res.error); return; }

    // upload recordings straight from the browser to private storage
    const supabase = createClient();
    const uploadErrors: string[] = [];
    for (const [i, f] of files.entries()) {
      setBusy(`Uploading recording ${i + 1} of ${files.length}…`);
      const safe = f.name.replace(/[^\w.\-]+/g, "_");
      const path = `${res.id}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from("recordings").upload(path, f, { contentType: f.type || "audio/mpeg" });
      if (upErr) { uploadErrors.push(`${f.name}: upload failed`); continue; }
      const linkErr = await recordUpload(res.id, path, f.name, f.size);
      if (linkErr) uploadErrors.push(`${f.name}: ${linkErr}`);
    }
    setBusy(null);
    setDone({ code: res.code, uploadErrors, seenBefore: res.seenBefore });
    formRef.current?.reset();
    setFiles([]);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done) {
    return (
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-emerald-700">Lead {done.code} submitted</h2>
        <p className="mt-1 text-sm text-slate-600">QA will review it. You&apos;ll see the result on your results page.</p>
        {done.seenBefore > 0 && (
          <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            Heads up: this phone number was already submitted {done.seenBefore} time{done.seenBefore > 1 ? "s" : ""} in the last 6 months. QA will check it.
          </p>
        )}
        {done.uploadErrors.length > 0 && (
          <div className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
            <p className="font-medium">Some recordings did not upload. Tell your manager the lead number ({done.code}):</p>
            <ul className="mt-1 list-disc pl-5">{done.uploadErrors.map((e) => <li key={e}>{e}</li>)}</ul>
          </div>
        )}
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" onClick={() => setDone(null)}>Submit another lead</button>
          <Link href="/agent" className="btn-secondary">See my results</Link>
        </div>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-6">
      <Section title="Business">
        {campaigns.length > 0 && (
          <Field label="Campaign" name="campaign_id" span={2}>
            <select id="campaign_id" name="campaign_id" className="field-input" defaultValue="">
              <option value="">Choose a campaign</option>
              {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
        )}
        <Input label="Company name *" name="company" required span={2} />
        <Input label="Industry type" name="business_type" placeholder="e.g. Gym, Office, Pest Control" />
        <Input label="Facility size" name="facility_size" placeholder="e.g. Around 2,500 sq ft" />
        <Input label="Street address" name="street" span={2} />
        <Input label="City" name="city" />
        <Input label="State" name="state" />
        <Input label="ZIP / Postcode" name="zip" />
        <Input label="Country" name="country" defaultValue={defaultCountry} />
      </Section>

      <Section title="Point of contact">
        <Input label="Contact name" name="contact_name" />
        <Input label="Designation" name="contact_designation" placeholder="e.g. Office Manager" />
        <Input label="Phone number *" name="phone" type="tel" required />
        <Input label="Email" name="email" type="email" />
      </Section>

      <Section title="Current service">
        <Field label="Current type" name="current_type">
          <select id="current_type" name="current_type" className="field-input" defaultValue="">
            <option value="">Not known</option>
            <option>Outside</option><option>InHouse</option><option>None</option>
          </select>
        </Field>
        <Input label="Current provider" name="current_provider" placeholder="Company they use now" />
        <Input label="Frequency" name="frequency" placeholder="e.g. 2x week" />
        <Input label="Preferences" name="preferences" placeholder="e.g. General" />
      </Section>

      <Section title="Appointment">
        <Input label="Date and time (client's local time)" name="appt_local" type="datetime-local" />
        <Field label="Client's time zone" name="appt_timezone">
          <select id="appt_timezone" name="appt_timezone" className="field-input" defaultValue={defaultTimezone}>
            {TIMEZONES.map((g) => (
              <optgroup key={g.group} label={g.group}>
                {g.items.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Notes and recording">
        <Field label="Notes (what the prospect said)" name="agent_notes" span={2}>
          <textarea id="agent_notes" name="agent_notes" rows={5} className="field-input"
            placeholder="Spoke with Sandy, who is interested in reviewing a cleaning estimate…" />
        </Field>
        <Field label={`Call recording (audio, up to ${MAX_MB} MB each)`} name="recordings" span={2}>
          <input id="recordings" name="recordings" type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm" multiple
            onChange={(e) => pickFiles(e.target.files)}
            className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:font-medium file:text-brand-700" />
          {files.length > 0 && (
            <ul className="mt-2 text-xs text-slate-600">
              {files.map((f) => <li key={f.name}>{f.name} · {(f.size / 1024 / 1024).toFixed(1)} MB</li>)}
            </ul>
          )}
        </Field>
      </Section>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={!!busy} className="btn-primary px-6">{busy ?? "Submit lead"}</button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5">
      <legend className="px-1 text-sm font-semibold text-slate-800">{title}</legend>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

function Field({ label, name, span, children }: { label: string; name: string; span?: 2; children: React.ReactNode }) {
  return (
    <div className={span === 2 ? "sm:col-span-2" : ""}>
      <label htmlFor={name} className="field-label">{label}</label>
      {children}
    </div>
  );
}

function Input({ label, name, span, ...rest }: { label: string; name: string; span?: 2 } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} name={name} span={span}>
      <input id={name} name={name} className="field-input" {...rest} />
    </Field>
  );
}
