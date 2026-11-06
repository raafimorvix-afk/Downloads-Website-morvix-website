import { requireProfile } from "@/lib/auth";
import { TopBar } from "@/components/topbar";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireProfile(["owner", "manager"]);
  const links = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/leads", label: "Leads" },
    { href: "/clients", label: "Clients" },
    { href: "/agents", label: "Agents" },
    { href: "/bdm", label: "BDM" },
    ...(me.role === "owner" ? [{ href: "/team", label: "Team" }] : []),
  ];
  return (
    <>
      <TopBar me={me} links={links} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
