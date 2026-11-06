import { signOut } from "@/app/login/actions";
import type { Profile } from "@/lib/auth";
import { Icon } from "./icons";
import { NavLinks, type NavItem } from "./nav-links";

const roleLabel = { owner: "Owner", manager: "Manager", agent: "Agent" } as const;

export function navFor(me: Profile): NavItem[] {
  if (me.role === "agent") return [
    { href: "/agent", label: "My results", icon: "results" },
    { href: "/agent/new", label: "Submit a lead", icon: "plus" },
  ];
  return [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/leads", label: "Leads", icon: "leads" },
    { href: "/calendar", label: "Calendar", icon: "calendar" },
    { href: "/clients", label: "Clients", icon: "clients" },
    { href: "/billing", label: "Billing", icon: "billing" },
    { href: "/agents", label: "Agents", icon: "agents" },
    { href: "/bdm", label: "BDM", icon: "bdm" },
    ...(me.role === "owner" ? [{ href: "/team", label: "Team", icon: "team" }] : []),
  ];
}

/** Left sidebar on desktop, compact top bar with scrollable pills on phones. */
export function AppShell({ me, items, children }: { me: Profile; items: NavItem[]; children: React.ReactNode }) {
  const who = (
    <span className="leading-tight">
      <span className="block text-sm font-medium">{me.full_name}</span>
      <span className="block text-xs opacity-70">{roleLabel[me.role]} · {me.shift?.name ?? "All shifts"}</span>
    </span>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col bg-[#0f1b33] px-3 py-5 text-white lg:flex lg:sticky lg:top-0 lg:h-screen">
        <div className="mb-6 flex items-center gap-2 px-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-lg font-bold">M</span>
          <span className="font-semibold">Morvix CRM</span>
        </div>
        <nav className="flex flex-1 flex-col gap-1" aria-label="Main"><NavLinks items={items} variant="side" /></nav>
        <div className="mt-4 border-t border-white/10 px-2 pt-4">
          {who}
          <form action={signOut} className="mt-3">
            <button className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"><Icon name="logout" className="h-4 w-4" />Sign out</button>
          </form>
        </div>
      </aside>

      <header className="border-b border-slate-200 bg-white lg:hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">M</span>Morvix CRM
          </span>
          <div className="flex items-center gap-3 text-slate-700">
            {who}
            <form action={signOut}><button aria-label="Sign out" className="rounded-lg p-2 ring-1 ring-slate-200"><Icon name="logout" className="h-4 w-4" /></button></form>
          </div>
        </div>
        <nav className="flex gap-2 overflow-x-auto px-4 pb-3" aria-label="Main"><NavLinks items={items} variant="top" /></nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8">{<div className="mx-auto max-w-7xl">{children}</div>}</main>
    </div>
  );
}
