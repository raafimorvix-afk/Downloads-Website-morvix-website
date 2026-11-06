import Link from "next/link";
import { signOut } from "@/app/login/actions";
import type { Profile } from "@/lib/auth";

const roleLabel = { owner: "Owner", manager: "Manager", agent: "Agent" } as const;

export function TopBar({ me, links = [] }: { me: Profile; links?: { href: string; label: string }[] }) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">M</span>
          Morvix CRM
        </Link>
        <nav className="flex gap-4 text-sm">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="text-slate-600 hover:text-slate-900">{l.label}</Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-right leading-tight">
            <span className="block font-medium">{me.full_name}</span>
            <span className="block text-xs text-slate-500">
              {roleLabel[me.role]}{me.shift ? ` · ${me.shift.name}` : " · All shifts"}
            </span>
          </span>
          <form action={signOut}>
            <button className="btn-secondary px-3 py-1.5">Sign out</button>
          </form>
        </div>
      </div>
    </header>
  );
}
