# Implementation Plan: Eventos Event Website Builder — Full Build-Out

## Current State Audit

### What Exists Today (`packages/website-builder-studio`)
| File | Status | Notes |
|------|--------|-------|
| `WebsiteBuilderStudio.tsx` | ✅ Scaffold | GrapesJS init, 3-tab sidebar (Sections/Layers/Theme), header bar, device switcher |
| `blocks/eventBlocks.ts` | ⚠️ Partial | 8 event sections registered. No Foundation blocks. No Import Panel. |
| `plugins/themePlugin.ts` | ✅ Working | CSS var injection into canvas iframe |
| `styles.css` | ✅ Good base | Glassmorphism block cards, 2-col grid, property inspector styled |
| `types.ts` | ⚠️ Thin | `EventDataBindings` only has speaker/sponsor/agenda. Missing full snapshot model |

### Critical Gaps
1. **No Foundation Components** (Columns, Text, Image, Media, Buttons, Forms, Navigation, Utilities) — GrapesJS default basic-blocks not integrated
2. **No Event Data Import Panel** — No UI to pull backend data into blocks at edit-time
3. **No Layout Variant System** — Speaker Grid exists as one block. Needs 6+ variants (Carousel, Masonry, List, Featured, Keynote, Timeline)
4. **No Multi-Page Management** — Builder only works as a single-page canvas
5. **No Favorites / Pinning** — No block pinning UX
6. **No Section Search / Filter** — No category filter or search in block panel
7. **Types incomplete** — `EventDataSnapshot` model doesn't match the full spec

---

## Implementation Phases

---

## Phase 1 — Foundation Architecture (Week 1)

> Establish the proper file structure, complete the data model, and integrate GrapesJS Foundation blocks.
> **No UI changes yet. This is purely structural.**

---

### 1.1 Restructure `packages/website-builder-studio/src/`

**Target directory tree:**
```
src/
├── index.ts
├── types.ts                          ← Expand to full EventDataSnapshot
├── WebsiteBuilderStudio.tsx          ← Main orchestrator (refactor)
├── styles.css                        ← Keep + expand
│
├── blocks/
│   ├── index.ts                      ← Barrel: registers all block categories
│   ├── foundation/
│   │   ├── layoutBlocks.ts           ← Column / Row / Grid / Spacer / Card
│   │   ├── typographyBlocks.ts       ← Heading / Paragraph / Quote / Counter
│   │   ├── mediaBlocks.ts            ← Image / Video / Gallery / Lottie / Icon
│   │   ├── buttonBlocks.ts           ← Primary / Secondary / Download / CTA
│   │   ├── formBlocks.ts             ← Contact / Newsletter / Inquiry / Sponsor Interest
│   │   ├── navigationBlocks.ts       ← Navbar / Footer / Breadcrumb
│   │   └── utilityBlocks.ts          ← Countdown / Map / QR Code / Social Icons
│   │
│   └── event/
│       ├── heroBlocks.ts             ← 8 hero layout variants
│       ├── overviewBlocks.ts         ← About / Organizer Message
│       ├── statisticsBlocks.ts       ← 4 stat layout variants
│       ├── countdownBlocks.ts        ← 4 countdown variants
│       ├── speakerBlocks.ts          ← 8 speaker layout variants
│       ├── committeeBlocks.ts        ← 4 committee variants
│       ├── agendaBlocks.ts           ← 6 agenda layout variants
│       ├── sponsorBlocks.ts          ← 5 sponsor layout variants
│       ├── registrationBlocks.ts     ← Ticket Cards / CTA Banner / Dates
│       ├── venueBlocks.ts            ← Venue / Hotels / Travel
│       ├── galleryBlocks.ts          ← Photo Grid / Carousel / Video Gallery
│       ├── downloadsBlocks.ts        ← Downloads / CFP / Abstract Topics
│       ├── marketingBlocks.ts        ← CTA Banners / Testimonials / Awards
│       ├── contactBlocks.ts          ← Contact Simple / Split / Map
│       └── footerBlocks.ts           ← Footer Simple / Multi-col / Newsletter
│
├── plugins/
│   ├── themePlugin.ts                ← Keep existing (working)
│   ├── importPanelPlugin.ts          ← NEW: Event Data Import Panel logic
│   ├── multiPagePlugin.ts            ← NEW: Page management state
│   └── customRTEPlugin.ts            ← NEW: Inline rich text editing override
│
├── components/
│   ├── BlockSearchFilter.tsx         ← NEW: Category filter + search input
│   ├── ImportDataPanel.tsx           ← NEW: Event Data Import Panel UI
│   ├── MultiPageManager.tsx          ← NEW: Page tab management sidebar
│   ├── ThemePanel.tsx                ← NEW: Extracted from WebsiteBuilderStudio
│   └── CodeExportModal.tsx           ← NEW: Extracted from WebsiteBuilderStudio
│
└── hooks/
    ├── useEditorState.ts             ← NEW: Editor init + state management hook
    └── useEventImport.ts             ← NEW: Backend data fetch + snapshot logic
```

---

### 1.2 Expand `types.ts` — Complete EventDataSnapshot Model

**[MODIFY]** [types.ts](file:///d:/DEV/conf-platform/packages/website-builder-studio/src/types.ts)

Add the full `EventDataSnapshot` interface alongside existing types:

```typescript
// ── Complete Event Data Snapshot ──────────────────────────────────────────
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
  date: string;           // YYYY-MM-DD
  startTime: string;      // HH:mm
  endTime: string;
  title: string;
  room?: string;
  chair?: string;
  speakerIds?: string[];
  track?: string;
  sessionType: 'KEYNOTE' | 'PANEL' | 'TALK' | 'WORKSHOP' | 'POSTER' | 'BREAK';
}

export interface Sponsor {
  id: string;
  name: string;
  logoUrl: string;
  websiteUrl?: string;
  tier: 'PLATINUM' | 'GOLD' | 'SILVER' | 'BRONZE' | 'EXHIBITOR' | 'PARTNER';
  boothNumber?: string;
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
}

export interface ImportantDate {
  id: string;
  label: string;
  date: string;           // ISO 8601
  type: 'ABSTRACT' | 'EARLY_BIRD' | 'REGISTRATION' | 'CONFERENCE' | 'NOTIFICATION';
}

export interface Hotel {
  id: string;
  name: string;
  distance?: string;
  bookingUrl?: string;
  photo?: string;
  rating?: number;
}

export interface EventDataSnapshot {
  // Core identity
  eventName: string;
  tagline?: string;
  startDate: string;
  endDate: string;
  logo?: string;
  banner?: string;
  primaryColor?: string;
  description?: string;
  objectives?: string[];
  welcomeNote?: string;

  // Venue
  venue?: {
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
  };

  // Organizer
  organizer?: {
    name: string;
    designation?: string;
    photo?: string;
    message?: string;
    email?: string;
    phone?: string;
    officeAddress?: string;
  };

  // People
  speakers?: Speaker[];
  committee?: CommitteeMember[];

  // Program
  sessions?: Session[];
  tracks?: string[];
  importantDates?: ImportantDate[];

  // Commercial
  sponsors?: Sponsor[];
  ticketCategories?: TicketCategory[];

  // Assets
  gallery?: Array<{ id: string; url: string; caption?: string; albumId?: string }>;
  videos?: Array<{ id: string; url: string; thumbnail?: string; title?: string }>;
  downloads?: Array<{ id: string; name: string; url: string; type: string }>;
  hotels?: Hotel[];
  faqs?: Array<{ id: string; question: string; answer: string }>;
  testimonials?: Array<{ id: string; name: string; designation?: string; photo?: string; quote: string }>;

  // Social
  socialLinks?: {
    twitter?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    youtube?: string;
  };

  // Snapshot metadata
  snapshotId: string;
  snapshotCreatedAt: string;
  disconnectedAt?: string;        // Set when user clicks "Disconnect from Event"
}

// Field selector — which keys of EventDataSnapshot a block has imported
export type EventDataField = keyof EventDataSnapshot;

export interface BlockImportState {
  blockId: string;
  importedFields: EventDataField[];
  snapshotId: string;
  importedAt: string;
  isDisconnected: boolean;
}
```

---

### 1.3 Install `grapesjs-blocks-basic` Foundation

**Install package:**
```bash
npm install grapesjs-blocks-basic --save
```

**[MODIFY]** [package.json](file:///d:/DEV/conf-platform/packages/website-builder-studio/package.json) — add dependency.

**[NEW]** `src/blocks/foundation/layoutBlocks.ts` — register basic layout blocks (1/2/3 Columns, Container, Row, Grid, Stack, Spacer, Divider, Card, Accordion, Tabs, Carousel) using `grapesjs-blocks-basic` + custom additions.

---

## Phase 2 — Foundation Component Library (Week 1-2)

> Register all 7 Foundation categories in the block panel. Each block is pre-styled to match Eventos dark glassmorphism design.

---

### 2.1 `foundation/layoutBlocks.ts`

Register: `Section`, `1-Column`, `2-Columns`, `3-Columns`, `2-Columns 3/7`, `Row`, `Grid`, `Stack Vertical`, `Stack Horizontal`, `Spacer`, `Divider`, `Card`, `Accordion`, `Tabs`, `Carousel`, `Masonry Grid`, `Timeline`, `Sticky Section`

Each block has GrapesJS **trait definitions** for all editable properties (padding, gap, background, border-radius, alignment, etc.) so the right Inspector panel shows proper controls.

---

### 2.2 `foundation/typographyBlocks.ts`

Register: `Display Heading`, `Paragraph`, `Lead Text`, `Rich Text`, `Blockquote`, `Caption / Eyebrow`, `Code Block`, `Number Counter`, `Highlight Text`, `Marquee Text`

GrapesJS traits: font-size selector, weight, color picker, alignment buttons, line-height.

---

### 2.3 `foundation/mediaBlocks.ts`

Register: `Image`, `Gallery Grid`, `Image Slider`, `Video Embed`, `YouTube Embed`, `Vimeo Embed`, `Logo Cloud Marquee`, `Icon`, `Lottie Animation`, `SVG`

GrapesJS traits: src URL input, alt text, aspect-ratio, object-fit, lazy-load toggle.

---

### 2.4 `foundation/buttonBlocks.ts`

Register: `Primary Button`, `Secondary Button (Outlined)`, `Icon Button`, `CTA Button`, `Download Button`, `Button Group`

GrapesJS traits: label text, URL, target (blank/self), icon selector, color picker, border-radius.

---

### 2.5 `foundation/formBlocks.ts`

Register: `Contact Form`, `Newsletter Subscribe`, `Inquiry Form`, `Sponsor Interest Form`, `Volunteer Form`, `Abstract Inquiry`

GrapesJS traits: recipient email (static, baked in), fields list, submit label, success message.

---

### 2.6 `foundation/navigationBlocks.ts`

Register: `Sticky Navbar (Transparent)`, `Sticky Navbar (Frosted)`, `Sticky Navbar (Solid)`, `Mobile Drawer`, `Breadcrumb`, `Page Progress Bar`

GrapesJS traits: logo src, menu items JSON array, CTA label + URL, background style.

---

### 2.7 `foundation/utilityBlocks.ts`

Register: `Countdown Timer`, `Progress Bar`, `Badge`, `Alert Banner`, `Tooltip`, `Social Icons Strip`, `QR Code`, `Map Embed`, `Cookie Banner`

GrapesJS traits: countdown target date ISO string, map address, social platform toggles.

---

## Phase 3 — Event Component Library (Week 2-3)

> The core differentiator. 15 event component families, each with multiple layout variants.
> All blocks share the common `EventDataImportTrait` (see Phase 4).

---

### 3.1 Hero Sections (`event/heroBlocks.ts`) — 8 variants

| Block ID | Layout | Key Features |
|----------|--------|-------------|
| `hero-classic` | Full-width centered | Title, dates, venue badge, 2 CTAs, BG image |
| `hero-split-left` | Text left / Image right | Side-by-side, responsive stack on mobile |
| `hero-split-right` | Image left / Text right | Mirror of above |
| `hero-fullscreen-video` | Video BG | Overlay gradient, countdown embed, CTA |
| `hero-floating-stats` | Image + floating glass stat cards | Hero image + hovering KPI cards |
| `hero-glassmorphism` | Dark gradient + frosted glass card | Premium dark feel |
| `hero-countdown-feature` | Event name + massive countdown | Urgency-first design |
| `hero-speakers-row` | Standard hero + speaker avatar strip | Speakers previewed below fold |

Each imports: `eventName`, `tagline`, `startDate`, `endDate`, `venue.city`, `banner`, `logo`

---

### 3.2 Overview Sections (`event/overviewBlocks.ts`) — 4 variants

| Block ID | Layout |
|----------|--------|
| `overview-split` | Left text / Right image |
| `overview-centered` | Centered + highlights icon list |
| `overview-objectives` | Description + 3-4 objective cards |
| `organizer-message` | Photo + quote + signature of conference chair |

Imports: `description`, `objectives`, `welcomeNote`, `organizer.*`

---

### 3.3 Statistics Sections (`event/statisticsBlocks.ts`) — 4 variants

| Block ID | Layout |
|----------|--------|
| `stats-4col` | 4 animated counter cards |
| `stats-bento` | Asymmetric bento grid of numbers |
| `stats-icons` | Icon + number + label glass cards |
| `stats-banner` | Full-width gradient band |

Imports: Backend aggregate counts (delegates, speakers, sessions, countries, sponsors, exhibitors)

---

### 3.4 Countdown Sections (`event/countdownBlocks.ts`) — 4 variants

| Block ID | Appearance |
|----------|-----------|
| `countdown-minimal` | Days / Hours / Min / Sec clean boxes |
| `countdown-glass` | Frosted glass card, large numerals |
| `countdown-banner` | Full-width gradient countdown strip |
| `countdown-inline` | Small embeddable variant for use inside other sections |

Imports: `startDate` (or registration deadline from `importantDates`)

---

### 3.5 Speaker Sections (`event/speakerBlocks.ts`) — 8 variants

| Block ID | Layout |
|----------|--------|
| `speakers-grid-3col` | Standard 3-col photo grid |
| `speakers-grid-4col` | Compact 4-col |
| `speakers-carousel` | Horizontal scrolling carousel |
| `speakers-masonry` | Pinterest-style uneven heights |
| `speakers-list` | Row-based left-photo right-text |
| `speakers-featured` | One large keynote hero card |
| `speakers-keynote-grid` | Filtered to keynote type only |
| `speakers-spotlight` | Left/right alternating full-section per speaker |

Imports (per speaker): `name`, `photo`, `designation`, `organization`, `country`, `talkTitle`, `speakerType`

> **Key**: All 8 variants share the same data model. Switching layout variant does **not** require re-import.

---

### 3.6 Committee Sections (`event/committeeBlocks.ts`) — 4 variants

| Block ID | Layout |
|----------|--------|
| `committee-grid` | 3-4 col photo grid |
| `committee-list` | Vertical text list |
| `committee-tabs` | Tabs: Scientific / Organizing / Advisory / Patrons |
| `committee-masonry` | Asymmetric card layout |

Imports (per member): `name`, `photo`, `designation`, `institution`, `committeeType`

---

### 3.7 Agenda Sections (`event/agendaBlocks.ts`) — 6 variants

| Block ID | Layout |
|----------|--------|
| `agenda-timeline` | Vertical timeline, left time / right content |
| `agenda-table` | Spreadsheet-style time × track grid |
| `agenda-cards` | Card per session, filterable by day |
| `agenda-daily-tabs` | Tabs per day, each tab shows timeline |
| `agenda-track-view` | Columns per track, simultaneous sessions |
| `agenda-compact` | Minimal list: time + title + room |

Imports (per session): `date`, `startTime`, `endTime`, `title`, `room`, `chair`, `speakerIds`, `track`, `sessionType`

---

### 3.8 Sponsor Sections (`event/sponsorBlocks.ts`) — 5 variants

| Block ID | Layout |
|----------|--------|
| `sponsors-tiered` | Gold / Silver / Bronze rows, size proportional to tier |
| `sponsors-grid` | Uniform logo grid |
| `sponsors-marquee` | Auto-scrolling logo ticker |
| `sponsors-with-description` | Logo + name + 1-line description |
| `exhibitors-grid` | Booth number + logo |

Imports (per sponsor): `name`, `logoUrl`, `websiteUrl`, `tier`, `boothNumber`

---

### 3.9 Registration & Tickets (`event/registrationBlocks.ts`) — 4 variants

| Block ID | Layout |
|----------|--------|
| `tickets-cards` | 2-4 pricing tier cards |
| `registration-cta-banner` | Full-width gradient "Register Now" banner |
| `important-dates-list` | Timeline of deadlines |
| `registration-categories` | Student / Professional / VIP icon cards |

Imports: `ticketCategories`, `importantDates`

---

### 3.10 Venue & Travel (`event/venueBlocks.ts`) — 5 variants

| Block ID | Layout |
|----------|--------|
| `venue-split` | Left: info / Right: map embed or photo |
| `venue-gallery` | Photo carousel of venue spaces |
| `venue-floor-plan` | Static floor plan image |
| `hotel-information` | Nearby hotel cards with booking links |
| `travel-information` | Airport / Visa / Weather / Transport icon grid |

Imports: `venue.*`, `hotels[]`

---

### 3.11 Gallery & Media (`event/galleryBlocks.ts`) — 5 variants

| Block ID | Layout |
|----------|--------|
| `gallery-grid` | Masonry photo grid with lightbox |
| `gallery-carousel` | Full-width slideshow |
| `video-gallery` | YouTube/Vimeo thumbnail grid |
| `promo-video` | Single feature video section |
| `instagram-preview` | Static screenshot grid |

Imports: `gallery[]`, `videos[]`

---

### 3.12 Downloads & CFP (`event/downloadsBlocks.ts`) — 3 variants

| Block ID | Layout |
|----------|--------|
| `downloads-list` | Icon + filename + download button |
| `downloads-cards` | Card per resource |
| `call-for-papers` | Submission deadline + topics + submit button |

Imports: `downloads[]`

---

### 3.13 Marketing & CTA (`event/marketingBlocks.ts`) — 5 variants

| Block ID | Purpose |
|----------|---------|
| `cta-register-banner` | Register Now full-width |
| `cta-sponsor-banner` | Become a Sponsor |
| `cta-submit-banner` | Submit Abstract / Paper |
| `testimonials-grid` | Attendee quotes in card grid |
| `testimonials-carousel` | Scrolling testimonial slider |

---

### 3.14 Contact (`event/contactBlocks.ts`) — 3 variants

| Block ID | Layout |
|----------|--------|
| `contact-simple` | Email + Phone + Address |
| `contact-split` | Left: info / Right: form |
| `contact-map` | Full-width map + overlay card |

Imports: `organizer.email`, `organizer.phone`, `organizer.officeAddress`

---

### 3.15 Footer (`event/footerBlocks.ts`) — 3 variants

| Block ID | Layout |
|----------|--------|
| `footer-simple` | Logo + copyright + social icons |
| `footer-multi-column` | Logo + link groups + socials + copyright |
| `footer-newsletter` | Footer with email subscribe inline |

Imports: `eventName`, `socialLinks`, `logo`

---

## Phase 4 — Event Data Import Panel (Week 3)

> **The single most important architectural feature.** Makes Eventos a true event platform, not just a website builder.

---

### 4.1 `plugins/importPanelPlugin.ts`

Implement a GrapesJS **custom command + trait** plugin:

```typescript
// When a block is selected, register an "Import from Event" trait group
editor.on('component:selected', (component) => {
  const importableFields = getImportableFieldsForBlock(component.get('type'));
  if (importableFields.length > 0) {
    // Show the ImportDataPanel UI in the right Inspector sidebar
    showImportPanel(component, importableFields, eventSnapshot);
  }
});
```

---

### 4.2 `components/ImportDataPanel.tsx`

A React component rendered in the right Inspector sidebar when an event block is selected:

**UI Wireframe:**
```
┌────────────────────────────────────┐
│ 📡  EVENT DATA IMPORT             │
│ ─────────────────────────────────  │
│ Event: "ICCC 2026 — Singapore"    │
│                                    │
│ Available to import:               │
│  ☑ Event Name & Tagline           │
│  ☑ Dates (Start / End)            │
│  ☑ Venue & City                   │
│  ☑ Banner Image                   │
│  ☐ Logo                           │
│                                    │
│  [  Import Selected  ]             │
│                                    │
│ ─ Already imported ─               │
│  ✓ Name · Dates · Venue           │
│  Snapshot: Aug 4, 2026 9:41 AM    │
│                                    │
│  [ Disconnect from Event Data ]   │
│  (becomes fully static)           │
└────────────────────────────────────┘
```

**State flow:**
```
idle → selecting fields → importing → imported (snapshot saved) → disconnected (static)
```

Once `isDisconnected = true`:
- "Import" button is hidden
- Block content is plain editable HTML
- `snapshotId` is stored in block's custom attributes
- Backend data is **never fetched again for this block on the published page**

---

### 4.3 `hooks/useEventImport.ts`

```typescript
interface UseEventImportReturn {
  snapshot: EventDataSnapshot | null;
  isLoading: boolean;
  error: string | null;
  importFields: (fields: EventDataField[]) => EventDataSnapshot;
  disconnect: () => void;
}

function useEventImport(eventId: string, backendFetchFn?: (id: string) => Promise<EventDataSnapshot>): UseEventImportReturn
```

- Fetches event data from backend once on mount (or uses `eventData` prop passed from parent)
- `importFields()` returns a filtered snapshot of only the requested fields
- `disconnect()` sets `disconnectedAt` timestamp and freezes the data

---

## Phase 5 — Sidebar UX Overhaul (Week 3-4)

> Transform the left sidebar from a flat list to a premium categorized section library.

---

### 5.1 `components/BlockSearchFilter.tsx`

Add to the top of the "Sections" tab in the left sidebar:

**Features:**
- **Search input**: Filters visible blocks in real-time by name/category
- **Category pills**: Horizontal scrollable category filter (⭐ Favorites, 📄 Layout, 🎉 Event Overview, 👥 Speakers, etc.)
- **Favorites**: Star icon on each block card. Starred blocks appear in "⭐ Favorites" category
- **Section count badge**: Each category pill shows block count

**Implementation:** Since GrapesJS `BlockManager` doesn't natively support search/filter, we'll implement this by toggling CSS `display: none` on `.gjs-block` elements dynamically via the block's `category` attribute.

---

### 5.2 Left Sidebar Tab Update

Add a 4th tab: **"Pages"** (for multi-page management — Phase 6).

Update tab strip:
```
[ Sections ] [ Layers ] [ Theme ] [ Pages ]
```

---

### 5.3 Category Organization in the Block Panel

Full category taxonomy to register in GrapesJS BlockManager:

```
Foundation:
  Basic           → Layout columns, Spacer, Divider
  Typography      → Heading, Paragraph, Quote, Counter
  Media           → Image, Video, Gallery, Icon
  Buttons         → Primary, Secondary, Download
  Forms           → Contact, Newsletter, Inquiry
  Navigation      → Navbar, Breadcrumb
  Utilities       → Countdown, Map, QR Code

Event Sections:
  Hero & Headers
  Event Overview
  Event Statistics
  Countdown Timers
  Speakers & Committee
  Program & Agenda
  Sponsors & Partners
  Tickets & Registration
  Venue & Travel
  Gallery & Media
  Downloads & CFP
  Marketing & CTA
  Contact & Footer
```

---

## Phase 6 — Multi-Page Manager (Week 4)

> Conference websites always have multiple pages: Home, About, Speakers, Agenda, Venue, Contact, etc.

---

### 6.1 `plugins/multiPagePlugin.ts`

Data model:
```typescript
interface PageConfig {
  id: string;
  name: string;
  slug: string;
  isHomePage: boolean;
  html: string;
  css: string;
  components: any;
  styles: any;
  seoTitle?: string;
  seoDescription?: string;
  createdAt: string;
  updatedAt: string;
}
```

When user switches between pages:
1. Serialize current canvas → store as `pages[currentPageId]`
2. Load selected page's `html`/`components` into canvas

---

### 6.2 `components/MultiPageManager.tsx`

Displayed in the "Pages" sidebar tab:

**UI:**
```
[ + New Page ]

◉ Home (/)
  Speakers (/speakers)
  Agenda (/agenda)
  Venue (/venue)
  Contact (/contact)

Right-click options: Rename · Duplicate · Delete · Set as Home
```

**Page SEO settings** (per-page panel in Inspector):
- Page Title
- Meta Description
- OG Image URL

---

### 6.3 `WebsiteProjectData` expansion

```typescript
interface WebsiteProjectData {
  // existing...
  pages?: PageConfig[];
  activePageId?: string;
  siteSettings?: {
    siteName?: string;
    favicon?: string;
    globalCSS?: string;
    googleFontsUrl?: string;
  };
}
```

---

## Phase 7 — Polish, Performance & Inspector (Week 4-5)

---

### 7.1 Right Inspector Panel Enhancement

Replace raw GrapesJS style panels with organized, themed sections:

**Tabs inside Inspector:**
```
[ Style ] [ Settings ] [ Import ]
```

- **Style tab**: Dimension, Typography, Decoration, Background, Shadow (existing GrapesJS style manager, CSS-styled)
- **Settings tab**: GrapesJS Trait Manager (block-specific attributes)
- **Import tab**: `ImportDataPanel` component (Phase 4)

---

### 7.2 Canvas UX Improvements

- **Drop zone ghost**: When dragging a block, show a styled "Drop here" ghost placeholder in the canvas
- **Section border hover**: On hover over any section in the canvas, show a subtle border + "Drag to reorder" handle
- **Empty canvas state**: When canvas has no blocks, show a centered "Start building" prompt with 3 quick-start template buttons

---

### 7.3 `WebsiteBuilderStudio.tsx` Refactor

Extract heavy UI logic into sub-components:

```tsx
// Before: 355-line monolith
// After:
<WebsiteBuilderStudio>
  <StudioHeader />                   ← Extracted
  <StudioBody>
    <LeftSidebar>
      <BlockSearchFilter />          ← NEW
      <GjsBlocksContainer />
      <GjsLayersContainer />
      <ThemePanel />                 ← Extracted
      <MultiPageManager />           ← NEW (Phase 6)
    </LeftSidebar>
    <CanvasContainer />
    <RightInspector>
      <StyleTab />
      <SettingsTab />
      <ImportTab>
        <ImportDataPanel />          ← NEW (Phase 4)
      </ImportTab>
    </RightInspector>
  </StudioBody>
  <CodeExportModal />                ← Extracted
</WebsiteBuilderStudio>
```

---

### 7.4 Canvas Iframe Font Injection

Inject Google Fonts into the canvas iframe's `<head>` so section templates render with the correct fonts:

```typescript
// In themePlugin.ts
editor.on('load', () => {
  const canvasDoc = editor.Canvas.getDocument();
  const fontLink = canvasDoc.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=DM+Serif+Display&family=Space+Grotesk:wght@400;500;600;700&display=swap';
  canvasDoc.head.appendChild(fontLink);
});
```

---

## Phase 8 — Section Templates Catalog (Week 5)

> The `WebsiteTemplateStudioScreen.tsx` in Command Center gets a full upgrade to a premium visual catalog.

---

### 8.1 Template Catalog Data Model

```typescript
interface SectionTemplate {
  id: string;
  name: string;
  category: SectionCategory;
  subcategory?: string;
  description: string;
  tags: string[];
  previewImageUrl: string;      // Static screenshot
  html: string;
  css?: string;
  eventDataFields?: EventDataField[];  // Which fields this template can import
  isNew?: boolean;
  isPremium?: boolean;
  requiredPlan?: 'FREE' | 'PRO' | 'ENTERPRISE';
}
```

---

### 8.2 Catalog UX in `WebsiteTemplateStudioScreen.tsx`

**Layout:** Left category sidebar + Right template grid

```
┌─────────────────┬────────────────────────────────────────────┐
│ All Templates   │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐      │
│ ───────────     │  │ Hero │ │ Hero │ │ Hero │ │ Hero │      │
│ 🎯 Hero (15)   │  │ Card │ │ Card │ │ Card │ │ Card │      │
│ 📋 Overview (4) │  └──────┘ └──────┘ └──────┘ └──────┘      │
│ 📊 Stats (4)   │                                              │
│ 👥 Speakers(8) │  [  Preview  ] [  Use Template  ] [  Edit  ] │
│ 📅 Agenda (6)  │                                              │
│ ...             │                                              │
└─────────────────┴────────────────────────────────────────────┘
```

**Template card actions:**
- **Preview**: Opens live responsive preview modal (Desktop / Tablet / Mobile)
- **Use Template**: Loads template HTML into a new WebsiteBuilderStudio instance
- **Edit (Admin only)**: Opens in studio with full block editing

---

## Phase Summary Table

| Phase | Feature | Files Changed | Effort |
|-------|---------|--------------|--------|
| **1** | Folder restructure + full type system | `types.ts`, directory structure | 2 days |
| **2** | Foundation blocks (7 categories) | 7 new `foundation/*.ts` block files | 4 days |
| **3** | Event component families (15 families, 60+ variants) | 15 new `event/*.ts` block files | 5 days |
| **4** | Event Data Import Panel | `importPanelPlugin.ts`, `ImportDataPanel.tsx`, `useEventImport.ts` | 3 days |
| **5** | Sidebar UX: Search, Filter, Favorites | `BlockSearchFilter.tsx`, sidebar tab refactor | 2 days |
| **6** | Multi-page manager | `multiPagePlugin.ts`, `MultiPageManager.tsx` | 2 days |
| **7** | Polish: Inspector tabs, Canvas UX, Font inject, Studio refactor | Multiple files | 3 days |
| **8** | Template Catalog upgrade | `WebsiteTemplateStudioScreen.tsx` | 2 days |
| **Total** | | **~30+ files** | **~3 weeks** |

---

## Files to Create (New)

### `packages/website-builder-studio/src/`
- `blocks/index.ts`
- `blocks/foundation/layoutBlocks.ts`
- `blocks/foundation/typographyBlocks.ts`
- `blocks/foundation/mediaBlocks.ts`
- `blocks/foundation/buttonBlocks.ts`
- `blocks/foundation/formBlocks.ts`
- `blocks/foundation/navigationBlocks.ts`
- `blocks/foundation/utilityBlocks.ts`
- `blocks/event/heroBlocks.ts`
- `blocks/event/overviewBlocks.ts`
- `blocks/event/statisticsBlocks.ts`
- `blocks/event/countdownBlocks.ts`
- `blocks/event/speakerBlocks.ts`
- `blocks/event/committeeBlocks.ts`
- `blocks/event/agendaBlocks.ts`
- `blocks/event/sponsorBlocks.ts`
- `blocks/event/registrationBlocks.ts`
- `blocks/event/venueBlocks.ts`
- `blocks/event/galleryBlocks.ts`
- `blocks/event/downloadsBlocks.ts`
- `blocks/event/marketingBlocks.ts`
- `blocks/event/contactBlocks.ts`
- `blocks/event/footerBlocks.ts`
- `plugins/importPanelPlugin.ts`
- `plugins/multiPagePlugin.ts`
- `plugins/customRTEPlugin.ts`
- `components/BlockSearchFilter.tsx`
- `components/ImportDataPanel.tsx`
- `components/MultiPageManager.tsx`
- `components/ThemePanel.tsx`
- `components/CodeExportModal.tsx`
- `hooks/useEditorState.ts`
- `hooks/useEventImport.ts`

## Files to Modify (Existing)
- `src/types.ts` — expand to full `EventDataSnapshot`
- `src/WebsiteBuilderStudio.tsx` — refactor into sub-components
- `src/styles.css` — add new CSS for Import Panel, search filter, multi-page UI
- `src/plugins/themePlugin.ts` — add font injection
- `src/blocks/eventBlocks.ts` — **delete** (replaced by organized `event/` directory)
- `packages/website-builder-studio/package.json` — add `grapesjs-blocks-basic`
- `apps/cloud/command-center/.../WebsiteTemplateStudioScreen.tsx` — catalog UX upgrade

---

## Open Questions

> [!IMPORTANT]
> **Backend API for Event Import**: When the organizer clicks "Import from Event" in the builder, what endpoint does `useEventImport` call? Options:
> - (A) Reuse the existing Organiser Portal event detail API endpoint
> - (B) Create a new `/api/website-builder/event-snapshot/:eventId` endpoint specifically for builder use
> - (C) Pass full event data as a prop from the parent page (already partially done via `eventData`)
>
> **Recommendation**: Option C (prop-based) for the Organiser Portal (data is already in page context), and Option B for Command Center (admin needs to select which event to preview).

> [!IMPORTANT]
> **Multi-Page Storage**: Where do multiple pages get persisted? Options:
> - (A) Single JSON blob in the existing event/template record
> - (B) One database record per page
>
> **Recommendation**: Option A — store the full `WebsiteProjectData` (including `pages[]` array) as a single JSON field.

> [!NOTE]
> **Execution Order**: Phases 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 is the recommended sequence. However, Phase 4 (Import Panel) can be built in parallel with Phase 3 (Event blocks) since they are separate files. Phase 6 (Multi-page) can wait until Phase 5 is complete.
