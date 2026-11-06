import { requireProfile } from "@/lib/auth";
import { AppShell, navFor } from "@/components/app-shell";

export default async function AgentLayout({ children }: LayoutProps<"/agent">) {
  const me = await requireProfile(["agent", "owner"]);
  return <AppShell me={me} items={navFor({ ...me, role: "agent" })}>{children}</AppShell>;
}
