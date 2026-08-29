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
      "Arunachal Pradesh",
      "Assam",
      "Bihar",
      "Chhattisgarh",
      "Goa",
      "Gujarat",
      "Haryana",
      "Himachal Pradesh",
      "Jharkhand",
      "Karnataka",
      "Kerala",
      "Madhya Pradesh",
      "Maharashtra",
      "Manipur",
      "Meghalaya",
      "Mizoram",
      "Nagaland",
      "Odisha",
      "Punjab",
      "Rajasthan",
      "Sikkim",
      "Tamil Nadu",
      "Telangana",
      "Tripura",
      "Uttar Pradesh",
      "Uttarakhand",
      "West Bengal",
      "Andaman and Nicobar Islands",
      "Chandigarh",
      "Dadra and Nagar Haveli and Daman and Diu",
      "Delhi",
      "Jammu and Kashmir",
      "Ladakh",
      "Lakshadweep",
      "Puducherry",
    ],
  },
  {
    country: "United States",
    states: [
      "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida",
      "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine",
      "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska",
      "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota",
      "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
      "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming"
    ],
  },
  {
    country: "United Arab Emirates",
    states: ["Abu Dhabi", "Dubai", "Sharjah", "Ajman", "Umm Al Quwain", "Ras Al Khaimah", "Fujairah"],
  },
  {
    country: "United Kingdom",
    states: ["England", "Northern Ireland", "Scotland", "Wales"],
  },
  {
    country: "Canada",
    states: [
      "Alberta", "British Columbia", "Manitoba", "New Brunswick", "Newfoundland and Labrador",
      "Nova Scotia", "Ontario", "Prince Edward Island", "Quebec", "Saskatchewan",
      "Northwest Territories", "Nunavut", "Yukon"
    ],
  },
  {
    country: "Australia",
    states: ["Australian Capital Territory", "New South Wales", "Northern Territory", "Queensland", "South Australia", "Tasmania", "Victoria", "Western Australia"],
  },
  {
    country: "Germany",
    states: ["Baden-Württemberg", "Bavaria", "Berlin", "Brandenburg", "Bremen", "Hamburg", "Hesse", "Lower Saxony", "Mecklenburg-Vorpommern", "North Rhine-Westphalia", "Rhineland-Palatinate", "Saarland", "Saxony", "Saxony-Anhalt", "Schleswig-Holstein", "Thuringia"],
  },
  {
    country: "Singapore",
    states: ["Central Region", "East Region", "North Region", "North-East Region", "West Region"],
  },
  {
    country: "Saudi Arabia",
    states: ["Riyadh", "Makkah", "Madinah", "Eastern Province", "Asir", "Tabuk", "Hail", "Northern Borders", "Jazan", "Najran", "Al Bahah", "Al Jawf", "Al Qassim"],
  },
  {
    country: "France",
    states: ["Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Brittany", "Centre-Val de Loire", "Corsica", "Grand Est", "Hauts-de-France", "Île-de-France", "Normandy", "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d'Azur"],
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
