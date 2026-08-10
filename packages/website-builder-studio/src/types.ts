// ── Studio Mode & Theme ────────────────────────────────────────────────────
export type WebsiteBuilderMode = 'GLOBAL_ADMIN' | 'ORGANIZER_TENANT';

export interface ThemePalette {
  primary: string;
  primaryHover?: string;
  secondary: string;
  background: string;
  surface: string;
  card: string;
  border?: string;
  textOnPrimary?: string;
  fontHeading?: string;
  fontBody?: string;
  radius?: string;
}

// ── Website Project Data ───────────────────────────────────────────────────
export interface PageConfig {
  id: string;
  name: string;
  slug: string;
  isHomePage: boolean;
  html: string;
  css: string;
  components?: unknown;
  styles?: unknown;
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WebsiteProjectData {
  id?: string;
  name?: string;
  // Legacy single-page (kept for backward compat)
  html?: string;
  css?: string;
  components?: unknown;
  styles?: unknown;
  // Multi-page (Option A: single JSON blob with pages[])
  pages?: PageConfig[];
  activePageId?: string;
  siteSettings?: {
    siteName?: string;
    favicon?: string;
    globalCSS?: string;
    googleFontsUrl?: string;
  };
  assets?: string[];
  theme?: ThemePalette;
  updatedAt?: string;
}

// ── Event Data Snapshot ────────────────────────────────────────────────────
// These are the full data models that event blocks can import from the backend.
// Once imported (via Option C: prop-based), the data becomes a static snapshot.

export interface Speaker {
  id: string;
  name: string;
  photo?: string;
  designation: string;
  organization?: string;
  country?: string;
  talkTitle?: string;
  track?: string;
  speakerType: 'KEYNOTE' | 'INVITED' | 'REGULAR' | 'WORKSHOP';
  bio?: string;
  sessionId?: string;
}

export interface CommitteeMember {
  id: string;
  name: string;
  photo?: string;
  designation: string;
  institution?: string;
  country?: string;
  committeeType: 'SCIENTIFIC' | 'ORGANIZING' | 'ADVISORY' | 'PATRON';
}

export interface Session {
  id: string;
  date: string;         // YYYY-MM-DD
  startTime: string;    // HH:mm
  endTime: string;
  title: string;
  room?: string;
  chair?: string;
  speakerIds?: string[];
  track?: string;
  sessionType: 'KEYNOTE' | 'PANEL' | 'TALK' | 'WORKSHOP' | 'POSTER' | 'BREAK';
  description?: string;
}

export interface Track {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'EXHIBITOR' | 'PARTNER' | 'MEDIA' | 'ACADEMIC';
  boothNumber?: string;
  description?: string;
}

export interface TicketCategory {
  id: string;
  name: string;
  price: number;
  currency: string;
  description?: string;
  deadline?: string;
  benefits?: string[];
  registrationUrl?: string;
  isHighlighted?: boolean;
}

export interface ImportantDate {
  id: string;
  label: string;
  date: string;   // ISO 8601
  type: 'ABSTRACT' | 'EARLY_BIRD' | 'REGISTRATION' | 'CONFERENCE' | 'NOTIFICATION' | 'OTHER';
}

export interface Hotel {
  id: string;
  name: string;
  distance?: string;
  bookingUrl?: string;
  photo?: string;
  rating?: number;
  priceRange?: string;
}

export interface GalleryItem {
  id: string;
  url: string;
  caption?: string;
  albumId?: string;
  type: 'PHOTO' | 'VIDEO';
}

export interface DownloadFile {
  id: string;
  name: string;
  url: string;
  type: 'BROCHURE' | 'PROGRAM' | 'ABSTRACT' | 'PROCEEDINGS' | 'FLYER' | 'OTHER';
  sizeLabel?: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category?: string;
}

export interface Testimonial {
  id: string;
  name: string;
  designation?: string;
  organization?: string;
  photo?: string;
  quote: string;
  year?: string;
}

export interface Award {
  id: string;
  name: string;
  description?: string;
  recipient?: string;
  category?: string;
}

export interface VenueInfo {
  name: string;
  address: string;
  city: string;
  country: string;
  description?: string;
  photos?: string[];
  floorPlanUrl?: string;
  mapEmbedUrl?: string;
  visaInfo?: string;
  transportInfo?: string;
  weatherInfo?: string;
  parkingInfo?: string;
}

export interface OrganizerProfile {
  name: string;
  designation?: string;
  photo?: string;
  message?: string;
  email?: string;
  phone?: string;
  officeAddress?: string;
}

// ── Full Event Data Snapshot ───────────────────────────────────────────────
// This is the ONE data model that all event blocks read from.
// Fetched once (Option C: passed as prop from parent page).
// Becomes static once "Disconnect from Event" is clicked.
export interface EventDataSnapshot {
  // Core identity
  eventName: string;
  tagline?: string;
  theme?: string;
  startDate: string;
  endDate: string;
  logo?: string;
  banner?: string;
  primaryColor?: string;
  description?: string;
  objectives?: string[];
  welcomeNote?: string;
  edition?: string;

  // Venue
  venue?: VenueInfo;

  // Organizer
  organizer?: OrganizerProfile;

  // People
  speakers?: Speaker[];
  committee?: CommitteeMember[];

  // Program
  sessions?: Session[];
  tracks?: Track[];
  importantDates?: ImportantDate[];

  // Commercial
  sponsors?: Sponsor[];
  ticketCategories?: TicketCategory[];

  // Assets
  gallery?: GalleryItem[];
  downloads?: DownloadFile[];
  hotels?: Hotel[];
  faqs?: FAQ[];
  testimonials?: Testimonial[];
  awards?: Award[];

  // Statistics (aggregated, numeric)
  stats?: {
    totalDelegates?: number;
    totalSpeakers?: number;
    totalSessions?: number;
    totalCountries?: number;
    totalSponsors?: number;
    totalExhibitors?: number;
    totalAbstracts?: number;
  };

  // Social
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    youtube?: string;
    website?: string;
  };

  // Snapshot metadata
  snapshotId: string;
  snapshotCreatedAt: string;
  disconnectedAt?: string;  // set when user clicks "Disconnect from Event"
}

// Field selector — which keys of EventDataSnapshot a block has imported
export type EventDataField = keyof EventDataSnapshot;

// Per-block import tracking (stored as block custom attribute in GrapesJS)
export interface BlockImportState {
  blockId: string;
  importedFields: EventDataField[];
  snapshotId: string;
  importedAt: string;
  isDisconnected: boolean;
}

// ── Legacy EventDataBindings (kept for backward compat) ───────────────────
// Old prop shape used before EventDataSnapshot was introduced.
// New code should use EventDataSnapshot. This is kept to avoid breaking
// existing usages in organiser-portal page.tsx.
export interface EventDataBindings {
  eventName?: string;
  eventDates?: string;
  venueName?: string;
  location?: string;
  speakers?: Array<{
    id: string;
    name: string;
    role: string;
    company?: string;
    avatarUrl?: string;
    topic?: string;
  }>;
  sponsors?: Array<{
    id: string;
    name: string;
    logoUrl: string;
    tier: 'PLATINUM' | 'GOLD' | 'SILVER';
  }>;
  agenda?: Array<{
    day: string;
    time: string;
    title: string;
    speaker?: string;
    track?: string;
  }>;
}

// ── Studio Props ───────────────────────────────────────────────────────────
export interface WebsiteBuilderStudioProps {
  mode: WebsiteBuilderMode;
  initialData?: WebsiteProjectData;
  theme?: Partial<ThemePalette>;
  // Option C: event data passed as prop from parent page
  eventData?: EventDataBindings;       // legacy
  eventSnapshot?: EventDataSnapshot;   // new full snapshot
  onSave?: (projectData: WebsiteProjectData) => Promise<void> | void;
  onPublish?: (projectData: WebsiteProjectData) => Promise<void> | void;
  onBack?: () => void;
  logoUrl?: string;
}
