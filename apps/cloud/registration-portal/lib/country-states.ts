export interface CountryStateEntry {
  country: string;
  states: string[];
}

interface CountriesNowState {
  name?: string;
  state_code?: string;
}

interface CountriesNowCountry {
  name?: string;
  country?: string;
  states?: CountriesNowState[];
}

const COUNTRIES_NOW_STATES_URL = "https://countriesnow.space/api/v0.1/countries/states";

export const fallbackCountryStates: CountryStateEntry[] = [
  {
    country: "India",
    states: [
      "Andhra Pradesh",
      "Delhi",
      "Gujarat",
      "Karnataka",
      "Kerala",
      "Maharashtra",
      "Tamil Nadu",
      "Telangana",
      "Uttar Pradesh",
      "West Bengal",
    ],
  },
  {
    country: "United States",
    states: ["California", "Florida", "Georgia", "Illinois", "New York", "North Carolina", "Ohio", "Pennsylvania", "Texas", "Washington"],
  },
  {
    country: "United Kingdom",
    states: ["England", "Northern Ireland", "Scotland", "Wales"],
  },
  {
    country: "Canada",
    states: ["Alberta", "British Columbia", "Manitoba", "Nova Scotia", "Ontario", "Quebec", "Saskatchewan"],
  },
  {
    country: "Australia",
    states: ["New South Wales", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
  },
  {
    country: "Germany",
    states: ["Bavaria", "Berlin", "Hamburg", "Hesse", "North Rhine-Westphalia", "Saxony"],
  },
];

export async function fetchCountryStates(): Promise<CountryStateEntry[]> {
  try {
    const res = await fetch(COUNTRIES_NOW_STATES_URL, { cache: "force-cache" });
    if (!res.ok) {
      throw new Error("Country/state API request failed.");
    }

    const payload = await res.json();
    const source: CountriesNowCountry[] = Array.isArray(payload?.data) ? payload.data : [];
    const entriesByCountry = new Map<string, Set<string>>();
    source.forEach((item) => {
      const country = String(item.name || item.country || "").trim();
      if (!country) return;

      const states = entriesByCountry.get(country) || new Set<string>();
      (item.states || [])
        .map((state) => String(state.name || "").trim())
        .filter(Boolean)
        .forEach((state) => states.add(state));
      entriesByCountry.set(country, states);
    });

    const entries = Array.from(entriesByCountry.entries())
      .map(([country, states]) => ({
        country,
        states: Array.from(states).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => a.country.localeCompare(b.country));

    return entries.length ? entries : fallbackCountryStates;
  } catch {
    return fallbackCountryStates;
  }
}

export function getAllowedCountries(fieldOptions: string[] | undefined, countryStates: CountryStateEntry[]) {
  const configured = (fieldOptions || []).map((country) => country.trim()).filter(Boolean);
  return Array.from(new Set(configured.length ? configured : countryStates.map((entry) => entry.country)));
}

export function getStatesForCountry(countryStates: CountryStateEntry[], country: string) {
  return countryStates.find((entry) => entry.country === country)?.states || [];
}
