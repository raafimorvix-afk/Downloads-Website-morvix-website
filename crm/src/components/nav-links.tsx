"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

export type NavItem = { href: string; label: string; icon: string };

export function NavLinks({ items, variant }: { items: NavItem[]; variant: "side" | "top" }) {
  const path = usePathname();
  return (
    <>
      {items.map((it) => {
        const active = path === it.href || (it.href !== "/" && path.startsWith(it.href + "/"));
        return variant === "side" ? (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? "bg-white/10 text-white" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>
            <Icon name={it.icon} />{it.label}
          </Link>
        ) : (
          <Link key={it.href} href={it.href} aria-current={active ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
              active ? "bg-brand-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>
            <Icon name={it.icon} className="h-4 w-4" />{it.label}
          </Link>
        );
      })}
    </>
  );
}
