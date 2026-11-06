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

/** "2026-11-13T11:00" as shown in the given zone, for <input type="datetime-local"> */
export function toLocalInput(iso: string | null, tz: string | null) {
  if (!iso) return "";
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** local wall-clock time in a zone -> ISO UTC. Handles daylight saving. */
export function zonedToUtc(local: string, tz: string) {
  const [d, t = "00:00"] = local.split("T");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi] = t.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  const offsetAt = (ms: number) => {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: tz, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hourCycle: "h23",
    }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - ms;
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc).toISOString();
}
