import type { Metadata } from "next";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { LeadForm } from "./lead-form";

export const metadata: Metadata = { title: "Submit a lead" };

export default async function NewLeadPage() {
  const me = await requireProfile(["agent", "owner"]);
  const supabase = await createClient();
  const { data: campaigns } = await supabase.from("campaigns").select("id, name")
    .eq("active", true).order("name");
  const isAustralia = me.shift?.name.toLowerCase().includes("australia") ?? false;
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Submit a lead</h1>
      <p className="mb-6 text-sm text-slate-500">
        Fill in what the prospect told you. Fields marked * are required. QA checks every lead before it goes to a client.
      </p>
      <LeadForm
        campaigns={campaigns ?? []}
        defaultTimezone={isAustralia ? "Australia/Sydney" : "America/New_York"}
        defaultCountry={isAustralia ? "Australia" : "United States"}
      />
    </div>
  );
}
