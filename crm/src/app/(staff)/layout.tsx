import { requireProfile } from "@/lib/auth";
import { AppShell, navFor } from "@/components/app-shell";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const me = await requireProfile(["owner", "manager"]);
  return <AppShell me={me} items={navFor(me)}>{children}</AppShell>;
}
