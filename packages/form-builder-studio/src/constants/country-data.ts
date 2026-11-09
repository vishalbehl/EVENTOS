export interface CountryStateEntry {
  country: string;
  states: string[];
}

export interface CountryDialCode {
  name: string;
  dial_code: string;
  code: string;
  flag: string;
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
  {
    country: "Japan",
    states: ["Tokyo", "Osaka", "Kyoto", "Kanagawa", "Aichi", "Hokkaido", "Fukuoka", "Hyogo", "Saitama", "Chiba", "Hiroshima", "Miyagi", "Okinawa"],
  },
  {
    country: "China",
    states: ["Beijing", "Shanghai", "Guangdong", "Zhejiang", "Jiangsu", "Shandong", "Sichuan", "Hubei", "Hunan", "Fujian", "Shaanxi"],
  },
  {
    country: "South Africa",
    states: ["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Free State", "Limpopo", "Mpumalanga", "North West", "Northern Cape"],
  },
  {
    country: "Brazil",
    states: ["São Paulo", "Rio de Janeiro", "Minas Gerais", "Bahia", "Paraná", "Rio Grande do Sul", "Pernambuco", "Ceará", "Federal District"],
  },
  {
    country: "Italy",
    states: ["Lombardy", "Lazio", "Campania", "Sicily", "Veneto", "Piedmont", "Emilia-Romagna", "Tuscany", "Apulia"],
  },
  {
    country: "Spain",
    states: ["Madrid", "Catalonia", "Andalusia", "Valencian Community", "Galicia", "Castile and León", "Basque Country", "Canary Islands", "Balearic Islands"],
  },
  {
    country: "Netherlands",
    states: ["North Holland", "South Holland", "North Brabant", "Gelderland", "Utrecht", "Overijssel", "Limburg", "Friesland", "Groningen"],
  },
  {
    country: "Switzerland",
    states: ["Zurich", "Bern", "Vaud", "Geneva", "Basel-Stadt", "Lucerne", "Ticino", "Valais", "Aargau", "St. Gallen"],
  },
  {
    country: "Sweden",
    states: ["Stockholm", "Västra Götaland", "Skåne", "Östergötland", "Uppsala", "Jönköping", "Västerbotten"],
  },
  {
    country: "Norway",
    states: ["Oslo", "Viken", "Vestland", "Trøndelag", "Rogaland", "Innlandet", "Agder", "Møre og Romsdal", "Nordland", "Troms og Finnmark"],
  },
  {
    country: "Denmark",
    states: ["Capital Region", "Central Denmark", "North Denmark", "Region Zealand", "Region of Southern Denmark"],
  },
  {
    country: "New Zealand",
    states: ["Auckland", "Wellington", "Canterbury", "Waikato", "Bay of Plenty", "Otago", "Manawatū-Whanganui", "Hawke's Bay"],
  },
  {
    country: "Malaysia",
    states: ["Kuala Lumpur", "Selangor", "Penang", "Johor", "Sabah", "Sarawak", "Perak", "Melaka", "Pahang", "Negeri Sembilan"],
  },
  {
    country: "Indonesia",
    states: ["Jakarta", "West Java", "Central Java", "East Java", "Bali", "Banten", "North Sumatra", "South Sulawesi"],
  },
  {
    country: "Thailand",
    states: ["Bangkok", "Chiang Mai", "Phuket", "Chonburi", "Nonthaburi", "Pathum Thani", "Khon Kaen"],
  },
  {
    country: "Philippines",
    states: ["Metro Manila", "Cebu", "Davao", "Cavite", "Laguna", "Pampanga", "Iloilo", "Batangas"],
  },
  {
    country: "Vietnam",
    states: ["Hanoi", "Ho Chi Minh City", "Da Nang", "Hai Phong", "Can Tho", "Binh Duong", "Dong Nai"],
  },
  {
    country: "South Korea",
    states: ["Seoul", "Gyeonggi", "Busan", "Incheon", "Daegu", "Daejeon", "Gwangju", "Ulsan", "Jeju"],
  },
  {
    country: "Bangladesh",
    states: ["Dhaka", "Chittagong", "Rajshahi", "Khulna", "Sylhet", "Barisal", "Rangpur", "Mymensingh"],
  },
  {
    country: "Sri Lanka",
    states: ["Western Province", "Central Province", "Southern Province", "North Western Province", "Northern Province", "Eastern Province"],
  },
  {
    country: "Nepal",
    states: ["Bagmati", "Gandaki", "Lumbini", "Koshi", "Madhesh", "Karnali", "Sudurpashchim"],
  },
  {
    country: "Pakistan",
    states: ["Punjab", "Sindh", "Khyber Pakhtunkhwa", "Balochistan", "Islamabad Capital Territory", "Gilgit-Baltistan", "Azad Jammu and Kashmir"],
  },
  {
    country: "Egypt",
    states: ["Cairo", "Alexandria", "Giza", "Dakahlia", "Red Sea", "South Sinai", "Luxor", "Aswan"],
  },
  {
    country: "Nigeria",
    states: ["Lagos", "Abuja FCT", "Kano", "Rivers", "Oyo", "Kaduna", "Ogun", "Enugu"],
  },
  {
    country: "Kenya",
    states: ["Nairobi", "Mombasa", "Kisumu", "Nakuru", "Kiambu", "Uasin Gishu", "Machakos"],
  },
  {
    country: "Qatar",
    states: ["Doha", "Al Rayyan", "Al Wakrah", "Al Daayen", "Al Khor", "Umm Salal"],
  },
  {
    country: "Kuwait",
    states: ["Al Asimah", "Hawalli", "Farwaniya", "Al Ahmadi", "Mubarak Al-Kabeer", "Al Jahra"],
  },
  {
    country: "Oman",
    states: ["Muscat", "Dhofar", "Musandam", "Al Batinah", "Al Dakhiliyah", "Al Sharqiyah"],
  },
  {
    country: "Bahrain",
    states: ["Capital", "Muharraq", "Northern", "Southern"],
  },
  {
    country: "Ireland",
    states: ["Dublin", "Cork", "Galway", "Limerick", "Waterford", "Kildare", "Meath", "Wicklow"],
  },
  {
    country: "Belgium",
    states: ["Brussels", "Antwerp", "East Flanders", "Flemish Brabant", "West Flanders", "Liège", "Hainaut", "Walloon Brabant"],
  },
  {
    country: "Austria",
    states: ["Vienna", "Lower Austria", "Upper Austria", "Styria", "Tyrol", "Carinthia", "Salzburg", "Vorarlberg", "Burgenland"],
  },
  {
    country: "Portugal",
    states: ["Lisbon", "Porto", "Braga", "Setúbal", "Aveiro", "Faro (Algarve)", "Coimbra", "Madeira", "Azores"],
  },
  {
    country: "Greece",
    states: ["Attica (Athens)", "Central Macedonia (Thessaloniki)", "Crete", "Western Greece", "Peloponnese", "South Aegean"],
  },
  {
    country: "Turkey",
    states: ["Istanbul", "Ankara", "Izmir", "Bursa", "Antalya", "Adana", "Gaziantep", "Konya"],
  },
  {
    country: "Mexico",
    states: ["Mexico City", "Jalisco", "Nuevo León", "State of Mexico", "Puebla", "Guanajuato", "Yucatán", "Quintana Roo"],
  },
  {
    country: "Argentina",
    states: ["Buenos Aires", "Córdoba", "Santa Fe", "Mendoza", "Tucumán", "Salta", "Entre Ríos"],
  },
  {
    country: "Colombia",
    states: ["Bogotá D.C.", "Antioquia (Medellín)", "Valle del Cauca (Cali)", "Cundinamarca", "Atlántico (Barranquilla)", "Santander"],
  },
  {
    country: "Chile",
    states: ["Santiago Metropolitan", "Valparaíso", "Biobío", "Maule", "Araucanía", "Antofagasta"],
  },
  {
    country: "Poland",
    states: ["Masovian (Warsaw)", "Lesser Poland (Kraków)", "Lower Silesian (Wrocław)", "Silesian", "Greater Poland (Poznań)", "Pomeranian (Gdańsk)"],
  },
];

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [
  { name: "India", dial_code: "+91", code: "IN", flag: "🇮🇳" },
  { name: "United States", dial_code: "+1", code: "US", flag: "🇺🇸" },
  { name: "United Kingdom", dial_code: "+44", code: "GB", flag: "🇬🇧" },
  { name: "United Arab Emirates", dial_code: "+971", code: "AE", flag: "🇦🇪" },
  { name: "Australia", dial_code: "+61", code: "AU", flag: "🇦🇺" },
  { name: "Canada", dial_code: "+1", code: "CA", flag: "🇨🇦" },
  { name: "Germany", dial_code: "+49", code: "DE", flag: "🇩🇪" },
  { name: "France", dial_code: "+33", code: "FR", flag: "🇫🇷" },
  { name: "Singapore", dial_code: "+65", code: "SG", flag: "🇸🇬" },
  { name: "Saudi Arabia", dial_code: "+966", code: "SA", flag: "🇸🇦" },
  { name: "Japan", dial_code: "+81", code: "JP", flag: "🇯🇵" },
  { name: "China", dial_code: "+86", code: "CN", flag: "🇨🇳" },
  { name: "South Africa", dial_code: "+27", code: "ZA", flag: "🇿🇦" },
  { name: "Brazil", dial_code: "+55", code: "BR", flag: "🇧🇷" },
  { name: "Italy", dial_code: "+39", code: "IT", flag: "🇮🇹" },
  { name: "Spain", dial_code: "+34", code: "ES", flag: "🇪🇸" },
  { name: "Netherlands", dial_code: "+31", code: "NL", flag: "🇳🇱" },
  { name: "Switzerland", dial_code: "+41", code: "CH", flag: "🇨🇭" },
  { name: "Sweden", dial_code: "+46", code: "SE", flag: "🇸🇪" },
  { name: "Norway", dial_code: "+47", code: "NO", flag: "🇳🇴" },
  { name: "Denmark", dial_code: "+45", code: "DK", flag: "🇩🇰" },
  { name: "New Zealand", dial_code: "+64", code: "NZ", flag: "🇳🇿" },
  { name: "Malaysia", dial_code: "+60", code: "MY", flag: "🇲🇾" },
  { name: "Indonesia", dial_code: "+62", code: "ID", flag: "🇮🇩" },
  { name: "Thailand", dial_code: "+66", code: "TH", flag: "🇹🇭" },
  { name: "Philippines", dial_code: "+63", code: "PH", flag: "🇵🇭" },
  { name: "Vietnam", dial_code: "+84", code: "VN", flag: "🇻🇳" },
  { name: "South Korea", dial_code: "+82", code: "KR", flag: "🇰🇷" },
  { name: "Bangladesh", dial_code: "+880", code: "BD", flag: "🇧🇩" },
  { name: "Sri Lanka", dial_code: "+94", code: "LK", flag: "🇱🇰" },
  { name: "Nepal", dial_code: "+977", code: "NP", flag: "🇳🇵" },
  { name: "Pakistan", dial_code: "+92", code: "PK", flag: "🇵🇰" },
  { name: "Egypt", dial_code: "+20", code: "EG", flag: "🇪🇬" },
  { name: "Nigeria", dial_code: "+234", code: "NG", flag: "🇳🇬" },
  { name: "Kenya", dial_code: "+254", code: "KE", flag: "🇰🇪" },
  { name: "Qatar", dial_code: "+974", code: "QA", flag: "🇶🇦" },
  { name: "Kuwait", dial_code: "+965", code: "KW", flag: "🇰🇼" },
  { name: "Oman", dial_code: "+968", code: "OM", flag: "🇴🇲" },
  { name: "Bahrain", dial_code: "+973", code: "BH", flag: "🇧🇭" },
  { name: "Ireland", dial_code: "+353", code: "IE", flag: "🇮🇪" },
  { name: "Belgium", dial_code: "+32", code: "BE", flag: "🇧🇪" },
  { name: "Austria", dial_code: "+43", code: "AT", flag: "🇦🇹" },
  { name: "Portugal", dial_code: "+351", code: "PT", flag: "🇵🇹" },
  { name: "Greece", dial_code: "+30", code: "GR", flag: "🇬🇷" },
  { name: "Turkey", dial_code: "+90", code: "TR", flag: "🇹🇷" },
  { name: "Mexico", dial_code: "+52", code: "MX", flag: "🇲🇽" },
  { name: "Argentina", dial_code: "+54", code: "AR", flag: "🇦🇷" },
  { name: "Colombia", dial_code: "+57", code: "CO", flag: "🇨🇴" },
  { name: "Chile", dial_code: "+56", code: "CL", flag: "🇨🇱" },
  { name: "Poland", dial_code: "+48", code: "PL", flag: "🇵🇱" },
  { name: "Czech Republic", dial_code: "+420", code: "CZ", flag: "🇨🇿" },
  { name: "Hungary", dial_code: "+36", code: "HU", flag: "🇭🇺" },
];

let cachedCountryStates: CountryStateEntry[] | null = null;

export async function fetchCountryStates(): Promise<CountryStateEntry[]> {
  if (cachedCountryStates && cachedCountryStates.length > 0) {
    return cachedCountryStates;
  }
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

    cachedCountryStates = entries.length ? entries : fallbackCountryStates;
    return cachedCountryStates;
  } catch {
    cachedCountryStates = fallbackCountryStates;
    return fallbackCountryStates;
  }
}

export function getAllowedCountries(
  fieldOptions: (string | { label: string; value: string })[] | undefined,
  countryStates: CountryStateEntry[]
): string[] {
  const configured = (fieldOptions || [])
    .map((item) => (typeof item === "string" ? item.trim() : item.value?.trim() || item.label?.trim()))
    .filter(Boolean) as string[];

  if (configured.length > 0) {
    return Array.from(new Set(configured));
  }
  return countryStates.map((entry) => entry.country).sort((a, b) => a.localeCompare(b));
}

export function getStatesForCountry(
  countryStates: CountryStateEntry[],
  countryName: string
): string[] {
  if (!countryName) return [];
  const normalized = countryName.toLowerCase().trim();
  const found = countryStates.find(
    (e) => e.country.toLowerCase().trim() === normalized
  );
  return found?.states || [];
}

export function getDialCodeForCountry(countryName: string): string {
  if (!countryName) return "+91";
  const normalized = countryName.toLowerCase().trim();
  const found = COUNTRY_DIAL_CODES.find(
    (c) => c.name.toLowerCase().trim() === normalized
  );
  return found?.dial_code || "+91";
}

export const MASTER_ROLE_CATEGORIES: Record<string, string[]> = {
  "General Attendees": [
    "Delegate",
    "Student Delegate",
    "Organizer",
    "Faculty Delegate",
    "Industry Professional",
    "Research Scholar",
    "International Delegate",
    "Corporate Attendee",
    "Government Representative",
    "Academic Attendee",
  ],
  "Presentation Related": [
    "Speaker",
    "Keynote Speaker",
    "Moderator",
    "Speaker / Presenter",
    "Invited Speaker",
    "Panel Speaker",
    "Session Chair",
    "Workshop Instructor",
  ],
  "Business & Partners": [
    "Sponsor Representative",
    "Exhibitor",
    "Partner Organization Member",
    "Investor",
    "Startup Founder",
    "Recruiter / Hiring Partner",
  ],
  "Media & Public Relations": [
    "Media",
    "Media Representative",
    "Journalist",
    "Photographer",
    "Videographer",
    "Content Creator / Influencer",
  ],
  "Event Operations": [
    "Volunteer",
    "Technical Staff",
    "AV Technician",
    "Event Coordinator",
    "Organizer Staff",
    "Support Staff",
  ],
  "Special Access": [
    "VIP Guest",
    "Chief Guest",
    "Guest of Honor",
    "Jury Member",
    "Advisory Board Member",
    "Committee Member",
  ],
  "Session Specific": [
    "Workshop Participant",
    "Poster Presenter",
    "Hands-on Training Participant",
    "Competition Participant",
    "ePoster Presenter",
    "Networking Participant",
  ],
};
