import { requireProfile } from "@/lib/auth";
import { TopBar } from "@/components/topbar";

export default async function AgentLayout({ children }: LayoutProps<"/agent">) {
  const me = await requireProfile(["agent", "owner"]);
  return (
    <>
      <TopBar me={me} links={[{ href: "/agent", label: "My results" }, { href: "/agent/new", label: "Submit a lead" }]} />
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </>
  );
}
