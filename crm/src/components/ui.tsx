import Link from "next/link";

export function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${className}`}>{children}</span>;
}

export function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="text-sm text-slate-500">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** ?ok= / ?err= messages set by server actions after a redirect */
export function Flash({ ok, err }: { ok?: string | string[]; err?: string | string[] }) {
  if (typeof ok === "string") return <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{ok}</p>;
  if (typeof err === "string") return <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</p>;
  return null;
}

export function Stat({ label, value, note, href, tone }: { label: string; value: string | number; note?: string; href?: string; tone?: string }) {
  const body = (
    <>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </>
  );
  return href
    ? <Link href={href} className="card block p-4 hover:border-brand-500">{body}</Link>
    : <div className="card p-4">{body}</div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-sm text-slate-500">{children}</p>;
}

export function Field({ label, children, span }: { label: string; children: React.ReactNode; span?: 2 | 3 }) {
  const cls = span === 3 ? "sm:col-span-3" : span === 2 ? "sm:col-span-2" : "";
  return (
    <label className={`block ${cls}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
