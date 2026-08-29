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
  // Present when a canonical document is adapted through GrapesJS. Keeping it
  // prevents a canvas snapshot from regenerating a different page root id.
  rootInstanceId?: string;
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

export type ResponsiveDevice = 'desktop' | 'tablet' | 'mobile';

export type ResponsiveStyleMap = Partial<Record<ResponsiveDevice, Record<string, string>>>;

export type DataBindingSource = 'current-event' | 'snapshot' | 'manual' | 'mock';

export interface DataBinding {
  id: string;
  source: DataBindingSource;
  fieldPath: string;
  snapshotId?: string;
  lastSyncedAt?: string;
  isOverridden?: boolean;
  fallbackStatus?: 'resolved' | 'missing' | 'mock' | 'error';
}

export interface ComponentState {
  hidden?: Partial<Record<ResponsiveDevice, boolean>>;
  locked?: boolean;
  name?: string;
  requiredSlot?: boolean;
  [key: string]: unknown;
}

export interface ComponentInstance {
  id: string;
  componentType: string;
  componentVersion: number;
  parentId?: string;
  children: string[];
  props: Record<string, unknown>;
  styles: ResponsiveStyleMap;
  bindings: DataBinding[];
  states: ComponentState;
}

export interface WebsitePage {
  id: string;
  name: string;
  slug: string;
  isHomePage: boolean;
  rootInstanceId: string;
  seoTitle?: string;
  seoDescription?: string;
  ogImageUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSettings {
  siteName?: string;
  favicon?: string;
  globalCSS?: string;
  googleFontsUrl?: string;
  publishMode?: 'static-resolved' | 'snapshot-reference';
}

export interface DesignTokens {
  theme?: ThemePalette;
  typography?: Record<string, unknown>;
  spacing?: Record<string, unknown>;
  colors?: Record<string, string>;
}

export interface NavigationMenu {
  id: string;
  name: string;
  items: BuilderLink[];
}

export interface AssetReference extends WebsiteAsset {
  kind?: 'image' | 'svg' | 'icon' | 'download';
  storagePath?: string;
  metadata?: Record<string, unknown>;
}

export interface DataSourceDefinition {
  id: string;
  type: 'event-snapshot' | 'manual' | 'mock' | 'external';
  label: string;
  snapshotId?: string;
  lastSyncedAt?: string;
  status?: 'connected' | 'snapshot' | 'missing' | 'mock' | 'manual' | 'error';
}

export interface WebsiteDocument {
  schemaVersion: number;
  site: SiteSettings;
  pages: WebsitePage[];
  instances: Record<string, ComponentInstance>;
  tokens: DesignTokens;
  menus: NavigationMenu[];
  assets: AssetReference[];
  dataSources: DataSourceDefinition[];
  checksum?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface WebsiteProjectData {
  id?: string;
  name?: string;
  publishSlug?: string;
  /** Canonical Website Builder document. HTML/CSS/GrapesJS fields are import-only delivery artifacts. */
  document?: WebsiteDocument;
  // Legacy single-page (kept for backward compat)
  html?: string;
  css?: string;
  components?: unknown;
  styles?: unknown;
  // Multi-page (Option A: single JSON blob with pages[])
  pages?: PageConfig[];
  activePageId?: string;
  /** Internal canvas adapter hint. Never persisted as canonical document state. */
  editorDevice?: ResponsiveDevice;
  siteSettings?: {
    siteName?: string;
    favicon?: string;
    globalCSS?: string;
    googleFontsUrl?: string;
  };
  assets?: WebsiteAsset[];
  theme?: ThemePalette;
  updatedAt?: string;
}

export type BuilderLinkType =
  | 'page'
  | 'anchor'
  | 'external'
  | 'email'
  | 'phone'
  | 'file'
  | 'registration'
  | 'speaker-portal'
  | 'custom-route';

export interface BuilderLink {
  type: BuilderLinkType;
  label?: string;
  pageId?: string;
  anchorId?: string;
  href?: string;
  url?: string;
  email?: string;
  phone?: string;
  route?: string;
  target?: '_self' | '_blank';
}

export interface WebsiteAsset {
  id: string;
  type: 'upload' | 'image' | 'svg' | 'icon';
  title: string;
  url?: string;
  thumbnailUrl?: string;
  svg?: string;
  source?: 'upload' | 'openverse' | 'undraw' | 'manual';
  creator?: string;
  license?: string;
  attribution?: string;
  sourceUrl?: string;
  savedAt: string;
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
  eventId?: string;
  onFetchEventData?: (eventId?: string) => Promise<EventDataSnapshot>;
  onSearchImages?: (query: string) => Promise<WebsiteAsset[]>;
  onPersistAsset?: (asset: WebsiteAsset) => Promise<WebsiteAsset> | WebsiteAsset;
  onUploadAsset?: (file: File) => Promise<WebsiteAsset>;
  onSave?: (projectData: WebsiteProjectData) => Promise<void> | void;
  onPublish?: (projectData: WebsiteProjectData, options: WebsitePublishOptions) => Promise<void> | void;
  onCreatePreview?: (projectData: WebsiteProjectData, previewId?: string) => Promise<{ previewId: string; url: string; expiresAt?: string }>;
  readOnly?: boolean;
  onBack?: () => void;
  logoUrl?: string;
}

export interface WebsitePublishOptions {
  slug: string;
  customDomain?: string;
}
