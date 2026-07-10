// Country data for signup and leaderboard filters, plus an offline geo guess.
// No external geolocation API: we infer the country from the browser locale
// (e.g. "fr-FR" -> FR) or the IANA timezone, then let the player confirm or
// change it. Country is always user-editable, so wrong guesses are harmless.

export const COUNTRIES: ReadonlyArray<readonly [string, string]> = [
  ["AR", "Argentina"], ["AT", "Austria"], ["AU", "Australia"], ["BE", "Belgium"],
  ["BG", "Bulgaria"], ["BR", "Brazil"], ["CA", "Canada"], ["CH", "Switzerland"],
  ["CL", "Chile"], ["CN", "China"], ["CO", "Colombia"], ["CZ", "Czechia"],
  ["DE", "Germany"], ["DK", "Denmark"], ["DZ", "Algeria"], ["EE", "Estonia"],
  ["EG", "Egypt"], ["ES", "Spain"], ["FI", "Finland"], ["FR", "France"],
  ["GB", "United Kingdom"], ["GR", "Greece"], ["HK", "Hong Kong"], ["HR", "Croatia"],
  ["HU", "Hungary"], ["ID", "Indonesia"], ["IE", "Ireland"], ["IL", "Israel"],
  ["IN", "India"], ["IS", "Iceland"], ["IT", "Italy"], ["JP", "Japan"],
  ["KE", "Kenya"], ["KR", "South Korea"], ["LT", "Lithuania"], ["LU", "Luxembourg"],
  ["LV", "Latvia"], ["MA", "Morocco"], ["MX", "Mexico"], ["MY", "Malaysia"],
  ["NG", "Nigeria"], ["NL", "Netherlands"], ["NO", "Norway"], ["NZ", "New Zealand"],
  ["PE", "Peru"], ["PH", "Philippines"], ["PL", "Poland"], ["PT", "Portugal"],
  ["RO", "Romania"], ["RS", "Serbia"], ["SA", "Saudi Arabia"], ["SE", "Sweden"],
  ["SG", "Singapore"], ["SI", "Slovenia"], ["SK", "Slovakia"], ["TH", "Thailand"],
  ["TR", "Türkiye"], ["TW", "Taiwan"], ["UA", "Ukraine"], ["US", "United States"],
  ["UY", "Uruguay"], ["VN", "Vietnam"], ["ZA", "South Africa"],
];

const NAME_BY_CODE = new Map(COUNTRIES);

export function countryName(code: string): string {
  return NAME_BY_CODE.get(code) ?? code;
}

/** ISO code -> flag emoji via regional indicator symbols. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return "🌐";
  return String.fromCodePoint(...[...code].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}

/** Timezone -> country for zones whose locale usually lacks a region. */
const TZ_COUNTRY: Record<string, string> = {
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US",
  "America/Los_Angeles": "US", "America/Phoenix": "US", "America/Anchorage": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Montreal": "CA",
  "America/Mexico_City": "MX", "America/Sao_Paulo": "BR", "America/Bogota": "CO",
  "America/Buenos_Aires": "AR", "America/Argentina/Buenos_Aires": "AR",
  "America/Santiago": "CL", "America/Lima": "PE", "America/Montevideo": "UY",
  "Europe/London": "GB", "Europe/Paris": "FR", "Europe/Berlin": "DE",
  "Europe/Madrid": "ES", "Europe/Rome": "IT", "Europe/Amsterdam": "NL",
  "Europe/Brussels": "BE", "Europe/Vienna": "AT", "Europe/Zurich": "CH",
  "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK",
  "Europe/Helsinki": "FI", "Europe/Warsaw": "PL", "Europe/Prague": "CZ",
  "Europe/Budapest": "HU", "Europe/Bucharest": "RO", "Europe/Sofia": "BG",
  "Europe/Athens": "GR", "Europe/Lisbon": "PT", "Europe/Dublin": "IE",
  "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Europe/Istanbul": "TR",
  "Europe/Belgrade": "RS", "Europe/Zagreb": "HR", "Europe/Vilnius": "LT",
  "Europe/Riga": "LV", "Europe/Tallinn": "EE", "Europe/Luxembourg": "LU",
  "Europe/Ljubljana": "SI", "Europe/Bratislava": "SK", "Europe/Reykjavik": "IS",
  "Asia/Tokyo": "JP", "Asia/Seoul": "KR", "Asia/Shanghai": "CN",
  "Asia/Hong_Kong": "HK", "Asia/Taipei": "TW", "Asia/Singapore": "SG",
  "Asia/Bangkok": "TH", "Asia/Jakarta": "ID", "Asia/Manila": "PH",
  "Asia/Kuala_Lumpur": "MY", "Asia/Kolkata": "IN", "Asia/Calcutta": "IN",
  "Asia/Ho_Chi_Minh": "VN", "Asia/Saigon": "VN", "Asia/Jerusalem": "IL",
  "Asia/Riyadh": "SA", "Africa/Cairo": "EG", "Africa/Casablanca": "MA",
  "Africa/Algiers": "DZ", "Africa/Lagos": "NG", "Africa/Nairobi": "KE",
  "Africa/Johannesburg": "ZA", "Australia/Sydney": "AU", "Australia/Melbourne": "AU",
  "Australia/Brisbane": "AU", "Australia/Perth": "AU", "Pacific/Auckland": "NZ",
};

/** Best-effort country guess from the browser, "" when unknown. */
export function guessCountry(): string {
  // locale region subtag ("fr-FR", "en-US") is the strongest signal
  for (const locale of navigator.languages ?? [navigator.language]) {
    const region = locale?.split("-")[1]?.toUpperCase();
    if (region && /^[A-Z]{2}$/.test(region) && NAME_BY_CODE.has(region)) return region;
  }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && TZ_COUNTRY[tz]) return TZ_COUNTRY[tz];
  } catch {
    // Intl unavailable — fall through
  }
  return "";
}
