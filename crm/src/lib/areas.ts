// Reads states out of the free-text "coverage area" so clients can be grouped and filtered by area.
const US: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut", DE: "Delaware",
  DC: "Washington DC", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa", KS: "Kansas",
  KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland", MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island",
  SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const AU: Record<string, string> = {
  NSW: "New South Wales", VIC: "Victoria", QLD: "Queensland", SA: "South Australia", WA: "Western Australia",
  TAS: "Tasmania", ACT: "Australian Capital Territory", NT: "Northern Territory",
};
// well-known cities that imply a state when the state itself isn't written
const CITY: Record<string, string> = {
  manhattan: "US-NY", brooklyn: "US-NY", queens: "US-NY", bronx: "US-NY", "staten island": "US-NY", "long island": "US-NY",
  houston: "US-TX", dallas: "US-TX", austin: "US-TX", "san antonio": "US-TX", "fort worth": "US-TX",
  miami: "US-FL", orlando: "US-FL", tampa: "US-FL", jacksonville: "US-FL", atlanta: "US-GA", chicago: "US-IL",
  "los angeles": "US-CA", "san diego": "US-CA", "san francisco": "US-CA", "san jose": "US-CA", phoenix: "US-AZ",
  columbus: "US-OH", cleveland: "US-OH", cincinnati: "US-OH", denver: "US-CO", seattle: "US-WA", boston: "US-MA",
  philadelphia: "US-PA", charlotte: "US-NC", nashville: "US-TN", "las vegas": "US-NV", detroit: "US-MI",
  sydney: "AU-NSW", melbourne: "AU-VIC", brisbane: "AU-QLD", "gold coast": "AU-QLD", adelaide: "AU-SA", perth: "AU-WA",
  hillsborough: "US-FL", pinellas: "US-FL", pasco: "US-FL",
  hobart: "AU-TAS", canberra: "AU-ACT", darwin: "AU-NT", geelong: "AU-VIC",
};

export type Area = { key: string; label: string; country: "US" | "AU" | "" };

export function areaLabel(key: string) {
  if (key === "nationwide") return "Nationwide";
  if (key === "unknown") return "Area not set";
  const [c, s] = key.split("-");
  return c === "US" ? `${US[s]} (${s})` : `${AU[s]} (${s})`;
}

/** All areas a client covers. `australia` = the client is in the Australia shift (resolves WA/SA as Australian). */
export function clientAreas(coverage: string | null, australia: boolean, leadStates: (string | null)[] = []): string[] {
  const text = (coverage ?? "").trim();
  if (!text || /^n\/?a$/i.test(text)) return fromLeads(leadStates, australia);
  const found = new Set<string>();
  if (/nation\s*wide|all states|all over (the )?(us|usa|united states)|entire (us|usa|country)/i.test(text)) found.add("nationwide");
  const lower = ` ${text.toLowerCase()} `;
  // full state names (longest first so "West Virginia" wins over "Virginia")
  const names = [...Object.entries(australia ? AU : US), ...Object.entries(australia ? US : AU)].sort((a, b) => b[1].length - a[1].length);
  let rest = lower;
  for (const [code, name] of names) {
    const re = new RegExp(`[^a-z]${name.toLowerCase()}[^a-z]`);
    if (re.test(rest)) {
      found.add(`${AU[code] === name ? "AU" : "US"}-${code}`);
      rest = rest.replace(re, " ");
    }
  }
  // codes written in capitals: "FL", "NSW"
  for (const tok of text.match(/\b[A-Z]{2,3}\b/g) ?? []) {
    if (australia && AU[tok]) found.add(`AU-${tok}`);
    else if (US[tok]) found.add(`US-${tok}`);
    else if (AU[tok]) found.add(`AU-${tok}`);
  }
  for (const [city, key] of Object.entries(CITY)) if (lower.includes(city)) found.add(key);
  // "New York" as a city is still New York state
  return found.size ? [...found] : fromLeads(leadStates, australia);
}

/** No coverage written: use the states of the leads this client actually received. */
function fromLeads(states: (string | null)[], australia: boolean): string[] {
  const out = new Set<string>();
  for (const raw of states) {
    const st = (raw ?? "").trim().toUpperCase();
    if (australia && AU[st]) out.add(`AU-${st}`);
    else if (!australia && US[st]) out.add(`US-${st}`);
  }
  return out.size ? [...out] : ["unknown"];
}
