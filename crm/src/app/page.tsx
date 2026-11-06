import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";

// Send each person to their home screen.
export default async function Home() {
  const me = await requireProfile();
  redirect(me.role === "agent" ? "/agent" : "/dashboard");
}
