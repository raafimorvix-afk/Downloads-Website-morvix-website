export const TIMEZONES = [
  { group: "United States", items: [
    { value: "America/New_York", label: "US Eastern (ET)" },
    { value: "America/Chicago", label: "US Central (CT)" },
    { value: "America/Denver", label: "US Mountain (MT)" },
    { value: "America/Phoenix", label: "Arizona (no DST)" },
    { value: "America/Los_Angeles", label: "US Pacific (PT)" },
    { value: "America/Anchorage", label: "Alaska" },
    { value: "Pacific/Honolulu", label: "Hawaii" },
  ] },
  { group: "Australia", items: [
    { value: "Australia/Sydney", label: "Sydney / NSW / ACT" },
    { value: "Australia/Melbourne", label: "Melbourne / VIC" },
    { value: "Australia/Brisbane", label: "Brisbane / QLD" },
    { value: "Australia/Adelaide", label: "Adelaide / SA" },
    { value: "Australia/Perth", label: "Perth / WA" },
    { value: "Australia/Hobart", label: "Hobart / TAS" },
    { value: "Australia/Darwin", label: "Darwin / NT" },
  ] },
];

const tzLabel = new Map(TIMEZONES.flatMap((g) => g.items.map((i) => [i.value, i.label] as const)));

/** "Fri, Nov 6, 11:00 AM (US Eastern)" in the given zone */
export function formatAppt(iso: string | null, tz: string | null) {
  if (!iso) return "Not set";
  const zone = tz || "Asia/Dhaka";
  const s = new Intl.DateTimeFormat("en-US", {
    timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
  const label = tzLabel.get(zone)?.replace(/ \(.+\)$/, "") ?? zone.split("/").pop()?.replace("_", " ");
  return `${s} (${label})`;
}

export function formatDate(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Dhaka", month: "short", day: "numeric", year: "numeric" })
    .format(new Date(iso));
}

export function formatBDT(n: number | string | null | undefined) {
  return "BDT " + Number(n ?? 0).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
