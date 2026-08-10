# Eventos — Event Website Builder: Complete Component Library Specification

> Authored from the perspective of a SaaS architect + MICE industry software engineer.
> Design principles applied: `frontend-design`, `ui-ux-pro-max`, `web-design-guidelines`.

---

## Mental Model: Think in Sections, Not Widgets

The key architectural decision is this:

> Every "component" in Eventos is a **pre-designed section template**, not a raw widget.
> The organizer drags it to the canvas and edits content — not the design.

This is how **Framer, Webflow, and Readymag** think. It is not how **Wix or GrapesJS default** think.
This is the architectural edge over Cvent, Whova, Ex Ordo, and every legacy event platform.

---

## PART 1 — Foundation Components

These are universal building blocks. Every section template is assembled from these atoms.

---

### 1. Layout Components

> The skeleton of every page. Structural. Purely compositional.

| Component | Sub-types | Editable Properties |
|-----------|-----------|---------------------|
| **Section** | Full-width, Contained, Narrow | Background, Padding (T/R/B/L), Min-Height, Overlay Color, Overlay Opacity, Z-Index |
| **Container** | Centered, Edge-to-Edge | Max-Width (720 / 960 / 1100 / 1280 / Full), Padding |
| **Row** | — | Gap, Alignment (Start / Center / End / Stretch), Wrap |
| **Column** | 1 / 2 / 3 / 4 / 5-col | Span, Width (%, px, fr), Alignment |
| **Grid** | Auto-fill, Fixed-cols | Columns, Row-Gap, Column-Gap, Min-Cell-Width |
| **Stack** | Vertical, Horizontal | Gap, Alignment, Justify, Reverse |
| **Spacer** | — | Height (px, rem, %) |
| **Divider** | Line, Gradient, Dotted, Wave SVG, Zigzag SVG | Color, Opacity, Thickness, Width, Margin |
| **Card** | Default, Elevated, Glass, Outlined | Padding, Border-Radius, Shadow, Background, Border |
| **Accordion** | Single-open, Multi-open | Active Color, Icon, Animation |
| **Tabs** | Underline, Pill, Boxed | Active Color, Tab Position (Top/Left) |
| **Carousel** | Slide, Fade, Stack | Autoplay, Interval, Indicators, Arrows, Loop |
| **Masonry Grid** | 2-col, 3-col, 4-col | Gap, Column-Width |
| **Timeline** | Vertical, Horizontal, Alternating | Color, Icon, Connector Style |
| **Sticky Section** | — | Top Offset, Z-Index |

---

### 2. Typography Components

> Typography carries personality. Every Eventos template should use a curated type scale.

| Component | Variants | Editable Properties |
|-----------|----------|---------------------|
| **Display Heading** | H1 through H4 | Font Family, Weight (300–900), Size, Line-Height, Letter-Spacing, Color, Gradient Text, Text-Align, Animation |
| **Paragraph** | Body, Lead, Small | Font, Size, Line-Height, Color, Max-Width, Column-Count |
| **Rich Text** | — | Full WYSIWYG (Bold, Italic, Links, Lists, Highlights) |
| **Quote / Blockquote** | Left-border, Centered, Large Quote Mark | Author, Color, Background, Font-Style |
| **Caption / Label** | Eyebrow, Badge Label, Tag | Text-Transform, Letter-Spacing, Color, Background |
| **Code Block** | Inline, Block | Language, Theme (Dark/Light), Font |
| **Number Counter** | Animated, Static | Start Value, End Value, Duration, Suffix/Prefix, Color |
| **Highlight Text** | Marker, Gradient, Underline | Color, Style, Width |
| **Marquee Text** | Scroll, Bounce | Speed, Direction, Repeat |

---

### 3. Media Components

> Images and video drive emotional impact on event sites.

| Component | Variants | Editable Properties |
|-----------|----------|---------------------|
| **Image** | Standard, Rounded, Circle, Full-Bleed | Src, Alt Text, Object-Fit, Aspect-Ratio, Shadow, Border-Radius, Lazy-Load |
| **Gallery Grid** | 2/3/4-col, Masonry | Images Array, Gap, Hover Effect, Lightbox On/Off |
| **Image Slider** | Slide, Fade, Ken Burns | Images, Autoplay, Interval, Controls |
| **Before / After** | — | Before Src, After Src, Handle Color |
| **Video** | Self-hosted, YouTube, Vimeo | URL, Autoplay, Muted, Loop, Controls, Aspect-Ratio |
| **Audio Player** | — | Src, Show Waveform |
| **PDF Preview** | Inline, Download-only | Src, Height |
| **SVG** | Inline editable | Color, Size |
| **Icon** | Lucide, Custom | Name, Size, Color, Weight |
| **Lottie Animation** | — | JSON Src, Loop, Autoplay, Speed |
| **Logo Cloud / Marquee** | Grid, Scroll, Carousel | Logos Array, Speed, Grayscale Toggle, Hover-Color |

---

### 4. Button Components

> Each screen should have one primary CTA. Secondary actions must be visually subordinate.

| Component | Variants | Editable Properties |
|-----------|----------|---------------------|
| **Primary Button** | Solid, Gradient | Label, URL, Icon (left/right), Color, Radius, Hover Effect, Loading State |
| **Secondary Button** | Outlined, Ghost | Label, URL, Border-Color, Hover Fill |
| **Icon Button** | Circle, Square | Icon, ARIA Label, Size, Color |
| **Floating Action Button** | Fixed, Relative | Icon, Color, Position, Shadow |
| **CTA Button** | Large, Banner-style | Label, Sub-label, Icon, URL, Badge |
| **Download Button** | — | Label, File URL, MIME-type Icon |
| **Button Group** | Segmented, Stack | Items, Active Color |

---

### 5. Form Components

> Even if registration is handled in the portal, inquiry / sponsorship forms need to live on the static site.

| Component | Editable Properties |
|-----------|---------------------|
| **Contact Form** | Fields, Submit Label, Recipient Email, Success Message |
| **Newsletter Form** | Placeholder, Submit Label, Privacy Note |
| **Inquiry Form** | Fields, Dropdown Options |
| **Sponsor Interest Form** | Tier Options, Fields |
| **Volunteer Form** | Fields, Role Options |
| **Abstract Inquiry** | Topic Dropdown, Fields |

> **Import Hook**: All forms can optionally import the Organizer's contact email from the Event data panel.

---

### 6. Navigation Components

| Component | Variants | Editable Properties |
|-----------|----------|---------------------|
| **Navbar** | Transparent, Frosted Glass, Solid, Sticky, Hidden-on-Scroll | Logo, Links, CTA Button, Mobile Drawer, Background, Height |
| **Mega Menu** | Column, Card | Sections, Icons, Descriptions |
| **Mobile Drawer** | Left, Right, Overlay | Width, Background, Close Icon |
| **Breadcrumb** | — | Separator, Items |
| **Footer Navigation** | Multi-column, Simple | Link Groups, Social Icons, Copyright |
| **Language Switcher** | Dropdown, Flag Icons | Locales |
| **Page Progress Bar** | — | Color, Height, Position |

---

### 7. Utility Components

| Component | Editable Properties |
|-----------|---------------------|
| **Countdown Timer** | Target Date, Label, Style (Minimal / Card / Clock / Banner), Colors |
| **Progress Bar** | Value, Max, Label, Color, Animated |
| **Badge** | Text, Color, Dot/Icon, Size |
| **Alert / Banner** | Text, Icon, Type (Info/Warning/Success), Dismissible |
| **Tooltip** | Text, Trigger, Position |
| **Modal** | Trigger, Width, Content |
| **Cookie Banner** | Accept Label, Decline Label, Policy URL |
| **Social Icons** | Platform List, Size, Color, Style (Filled/Outlined) |
| **QR Code** | Content URL, Size, Color, Logo Overlay |
| **Map Embed** | Address, Zoom, Style (Light/Dark), Height |
| **Social Feed** | Platform (Instagram / Twitter / LinkedIn), Static Screenshot Mode |

---

## PART 2 — Event Components

> These are what makes Eventos different from every other website builder.
> Every Event Component supports a **one-time static import** from your backend.

---

### Architecture Rule

```
Backend Event Data ──► Import Panel ──► Static Snapshot in Block ──► Published
                        (edit-time only)                              (no live connection)
```

Once the page is published, there is **zero dependency** on the backend.
The block simply contains static HTML and CSS derived from the imported data.

---

### Event Data Import Panel (appears in every event block's settings)

```
┌────────────────────────────────────────┐
│   📡  EVENT DATA IMPORT               │
│ ────────────────────────────────────── │
│  Event: "ICCC 2026 — Singapore"       │
│                                        │
│  ☑ Event Name & Theme                 │
│  ☑ Dates                              │
│  ☑ Venue & City                       │
│  ☑ Logo                               │
│  ☑ Banner Image                       │
│  ☐ Speakers                           │
│  ☐ Sessions & Agenda                  │
│  ☐ Sponsors                           │
│  ☐ Committee Members                  │
│  ☐ Gallery                            │
│  ☐ Hotels                             │
│  ☐ FAQs                               │
│  ☐ Downloads                          │
│  ☐ Important Dates                    │
│  ☐ Ticket Categories                  │
│                                        │
│  [  Import Selected Data  ]            │
│  ✓ Imported · Now Static              │
│  [  Disconnect & Edit Manually  ]     │
└────────────────────────────────────────┘
```

---

### EVENT COMPONENT FAMILIES

> Each family has multiple **layout variants**. The organizer picks a layout variant. All variants share the same data model — so they can switch layouts without re-importing data.

---

#### Family 1: EVENT HERO

**Purpose**: First impression. Event name, dates, venue, CTA, visual identity.

| Layout Variant | Description |
|----------------|-------------|
| Hero Classic | Full-width. Title, subtitle, dates, venue badge, two CTAs |
| Hero Split | Left: Text + CTA. Right: Event poster / banner image |
| Hero Fullscreen Video | Video background + overlay gradient + title + countdown |
| Hero With Floating Stats | Banner image + floating glass stat cards (delegates, speakers, etc.) |
| Hero Glassmorphism | Dark gradient background, frosted glass content card |
| Hero Countdown | Large event name + prominently featured countdown timer |
| Hero Abstract | Animated mesh gradient / particle background + text |
| Hero Conference Classic | Academic / formal tone. White/cream. Logo top-left. |
| Hero With Speakers Row | Hero + horizontal avatars strip of keynote speakers below |

**Import Fields**:
- Event Name, Tagline, Theme
- Start & End Dates
- Venue Name & City
- Banner Image
- Logo
- Register Now URL

---

#### Family 2: EVENT OVERVIEW / ABOUT

**Purpose**: Describe what the event is about. Welcome the attendee.

| Layout Variant | Description |
|----------------|-------------|
| Overview Split | Left text, right image |
| Overview Centered | Centered text, full icon list of highlights |
| Overview With Objectives | About text + 3–4 highlight objective cards |
| Organizer Message | Photo + quote + signature from the conference chair |
| Welcome Video | Short video embed + text description beside it |

**Import Fields**:
- Event Description (long text)
- Objectives / Highlights
- Organizer Name, Photo, Designation, Welcome Message

---

#### Family 3: EVENT STATISTICS

**Purpose**: Social proof through numbers. Delegates, speakers, sessions, countries, sponsors.

| Layout Variant | Description |
|----------------|-------------|
| Stats 4-Column | Four animated number counters in a row |
| Stats Bento Grid | Large number + label in a bento-style asymmetric grid |
| Stats With Icons | Icon + number + label in glass cards |
| Stats Banner | Full-width gradient band with stats |
| Stats With Map | Choropleth map + country/attendee count |

**Import Fields**:
- Expected Delegates, Speakers, Sessions, Countries, Sponsors, Exhibitors (all numeric, from backend aggregates)

> After import: numbers become **static HTML text** — no live API call on the published page.

---

#### Family 4: COUNTDOWN TIMER

**Purpose**: Create urgency. Count down to registration deadline, early-bird deadline, or event start.

| Layout Variant | Description |
|----------------|-------------|
| Countdown Minimal | Days / Hours / Minutes / Seconds boxes, clean |
| Countdown Glass | Frosted glass card, large numbers |
| Countdown Banner | Full-width banner countdown |
| Countdown Inline | Small inline counter inside a hero or CTA section |
| Countdown With Deadline | Shows "Registration Closes" label + date below |

**Import Fields**: Event Start Date / Registration Deadline (becomes a static ISO timestamp)

---

#### Family 5: COMMITTEE

**Purpose**: Show scientific committee, organizing committee, advisory board, patrons.

| Layout Variant | Description |
|----------------|-------------|
| Committee Grid | 3–4 column photo grid with name + designation + institution |
| Committee List | Vertical list layout, ideal for large committees |
| Committee With Role Tabs | Tabs: Scientific / Organizing / Advisory. Switches list |
| Committee Masonry | Asymmetric card layout |
| Committee Carousel | Horizontal scroll, ideal for mobile |

**Import Fields (per member)**:
- Name, Photo, Designation, Institution, Country, Committee Type

---

#### Family 6: SPEAKERS

> The most important and most-used event component family.

| Layout Variant | Description |
|----------------|-------------|
| Speaker Grid 3-col | Photo + Name + Title + Company + Talk topic |
| Speaker Grid 4-col | Compact cards |
| Speaker Carousel | One-at-a-time horizontal scroll |
| Speaker Masonry | Pinterest-style, different heights |
| Speaker List | Row-based, left photo right text |
| Featured Speaker | One large hero card. Used for keynote spotlight |
| Keynote Speakers Grid | Filtered to keynote speakers only, visually elevated |
| Speaker Timeline | Speaker linked to their session time slot |
| Speaker Spotlight Alternating | Left/Right alternating, each speaker gets a section |

**Import Fields (per speaker)**:
- Name, Photo, Designation, Organization, Country, Talk Title, Track, Speaker Type (Keynote / Invited / Regular)

---

#### Family 7: SESSION AGENDA

> One of the most complex event data models. Must support multi-day, multi-track, multi-room.

| Layout Variant | Description |
|----------------|-------------|
| Agenda Timeline Vertical | Vertical timeline, left time labels, right content |
| Agenda Table | Spreadsheet-style. Time × Track. |
| Agenda Cards | Card per session. Filterable by day/track. |
| Agenda Daily Tabs | Tabs for Day 1 / Day 2 / Day 3. Each tab shows timeline |
| Agenda Track View | One column per track. Simultaneous sessions side-by-side |
| Agenda Compact List | Minimal. Just time + title + room. |
| Agenda Featured Sessions | Highlights 3–5 marquee sessions |

**Import Fields (per session)**:
- Date, Start Time, End Time, Title, Room/Hall, Chair, Speaker(s), Track, Session Type (Keynote / Panel / Workshop / Poster / Break)

---

#### Family 8: SPONSORS & PARTNERS

| Layout Variant | Description |
|----------------|-------------|
| Sponsors Tiered | Gold / Silver / Bronze / Exhibitor rows with size variation |
| Sponsors Grid | Uniform logo grid. No tier hierarchy. |
| Sponsors Carousel / Marquee | Continuously scrolling logo band |
| Sponsors With Description | Logo + company name + 1-line description |
| Exhibitors Grid | Booth number + logo + website |
| Academic Partners | Dedicated section for institutional partners |
| Media Partners | Press and knowledge partners grid |

**Import Fields (per sponsor)**:
- Name, Logo, Website URL, Tier (Platinum/Gold/Silver/Bronze/Partner), Exhibitor Booth

---

#### Family 9: REGISTRATION & TICKETS

| Layout Variant | Description |
|----------------|-------------|
| Ticket Cards | 2–4 pricing tiers side by side |
| Registration CTA Banner | Full-width gradient banner, Register Now button |
| Important Dates | List of deadlines (abstract, early-bird, final) |
| Registration Categories | Student / Professional / VIP / Virtual card grid |
| Pricing Toggle | Annual / Monthly toggle style (Daily / Conference rates) |

**Import Fields**:
- Ticket categories (Name, Price, Description, Deadline, Benefits list)
- Important Dates (Label + Date)

---

#### Family 10: VENUE & TRAVEL

| Layout Variant | Description |
|----------------|-------------|
| Venue Split | Left: venue name + address + description. Right: Map embed or photo |
| Venue Gallery | Photo carousel of venue spaces |
| Venue Floor Plan | Static image of floor plan |
| Hotel Information | Nearby hotel cards with booking link |
| Travel Information | Airport / Visa / Weather / Currency / Transport in icon+text grid |
| Local Attractions | Grid of nearby attractions |

**Import Fields**:
- Venue Name, Address, City, Country, Description, Photos, Floor Plan Image
- Hotels: Name, Distance, Booking URL, Photo
- Visa / Transport text

---

#### Family 11: GALLERY & MEDIA

| Layout Variant | Description |
|----------------|-------------|
| Photo Gallery Grid | 3/4-col masonry grid with lightbox |
| Photo Gallery Carousel | Full-width slideshow |
| Video Gallery | Thumbnail grid of YouTube/Vimeo embeds |
| Promo Video | Single large video feature |
| 3D Gallery (Coverflow) | Horizontal 3D scroll effect |
| Instagram Preview | Static screenshot grid of posts |

**Import Fields**:
- Photo Albums (images array), Videos (URL + Thumbnail), Caption

---

#### Family 12: RESOURCES & DOWNLOADS

| Layout Variant | Description |
|----------------|-------------|
| Downloads List | Icon + filename + download button list |
| Downloads Cards | Card per resource (Brochure, Schedule, Proceedings) |
| Call For Papers | Submission deadline + topics + submit button |
| Abstract Topics | Tag cloud / grid of research topic areas |

**Import Fields**:
- Files: Name, Type, URL
- CFP: Submission URL, Deadline, Topics

---

#### Family 13: MARKETING & CTA

| Layout Variant | Description |
|----------------|-------------|
| CTA Banner - Register | Large banner, Register Now |
| CTA Banner - Sponsor | Become a Sponsor CTA |
| CTA Banner - Submit | Submit Abstract / Paper |
| CTA Banner - Volunteer | Volunteer / Help Organize |
| Newsletter Subscribe | Email capture form |
| Testimonials Grid | Previous attendee quotes + photo |
| Testimonials Carousel | Scrolling testimonial slider |
| Awards Section | Best Paper / Young Researcher awards list |
| Media Coverage | Press logos + link list |

---

#### Family 14: CONTACT & FOOTER

| Layout Variant | Description |
|----------------|-------------|
| Contact Simple | Email + Phone + Address |
| Contact Split | Left: contact info. Right: contact form |
| Contact Map | Full-width map + overlay contact card |
| Footer Simple | Logo + copyright + social icons |
| Footer Multi-column | Logo + navigation link groups + social icons + copyright |
| Footer Newsletter | Footer with email subscribe inline |

**Import Fields**:
- Organizer Email, Phone, Office Address
- Social Links (Twitter/X, LinkedIn, Instagram, Facebook, YouTube)
- Copyright text

---

#### Family 15: DECORATIVE & INTERACTIVE

| Component | Purpose |
|-----------|---------|
| Section Divider (SVG Wave) | Smooth visual transition between sections |
| Section Divider (Diagonal) | Angular cut between two sections |
| Section Divider (Curved) | Convex/Concave curve transition |
| Background Mesh Gradient | Animated or static mesh gradient fill |
| Background Aurora | Animated northern lights effect |
| Background Particle | Subtle floating particle field |
| Background Pattern | Dot grid, cross-hatch, diagonal lines |
| Floating Shapes | Decorative abstract blobs / circles |
| FAQ Accordion | Q&A expandable list |
| Interactive Map Hotspots | Static venue floor plan with room labels |

---

## PART 3 — Builder Organization

The left panel category structure:

```
⭐  Favorites           (pinned by user)
─────────────────────────────────────────
📄  Layouts             Section · Container · Row · Grid · Stack
🔤  Typography          Heading · Paragraph · Quote · Counter
🖼️  Media               Image · Video · Gallery · Icon · Lottie
🔘  Buttons             Primary · Secondary · Icon · CTA · Download
📝  Forms               Contact · Newsletter · Inquiry · CFP
🧭  Navigation          Navbar · Footer · Breadcrumb · Drawer
📦  Utilities           Countdown · Progress · Badge · Map · QR Code
─────────────────────────────────────────
🎯  Event Hero          15+ hero layout variants
📋  Event Overview      About · Organizer Message · Highlights
📊  Event Statistics    Counter cards · Bento · Map stats
⏱️  Countdown Timers    Minimal · Glass · Banner · Deadline
👥  Speakers            Grid · Carousel · Masonry · Featured · Keynote
👔  Committee           Grid · List · Tabs · Masonry
📅  Agenda              Timeline · Table · Daily Tabs · Track View
🎫  Registration        Ticket Cards · CTA Banner · Important Dates
🤝  Sponsors            Tiered · Marquee · Grid · Exhibitors
📍  Venue & Travel      Venue · Hotels · Travel Info · Attractions
🖼️  Gallery             Grid · Carousel · Video · Instagram
📚  Downloads           List · Cards · Call For Papers
📣  Marketing & CTA     Register · Sponsor · Submit · Newsletter
📞  Contact             Simple · Split · Map
🦶  Footer              Simple · Multi-column · Newsletter
✨  Decorative          Dividers · Backgrounds · Shapes
```

---

## PART 4 — Recommended Premium Section Count

Instead of hundreds of atomic widgets, ship **~120 polished, opinionated sections**:

| Category | Count |
|----------|-------|
| 🎯 Hero Sections | 15 |
| 📋 Content / Text + Image | 20 |
| 📐 Card & Feature Layouts | 12 |
| 📊 Statistics & KPIs | 8 |
| 🤝 Sponsors & Logo Sections | 8 |
| 🖼️ Gallery & Media | 10 |
| 🎫 CTA & Registration | 10 |
| 🎉 Event-Specific Sections | 20 |
| 🦶 Footer & Contact | 8 |
| ✨ Decorative & Interactive | 10 |
| **Total** | **~121** |

---

## PART 5 — Design System Principles Applied

From `frontend-design` skill:

> **Typography carries personality.** Each Eventos template should ship with a pre-selected font pairing — e.g., **DM Serif Display + Inter** for academic events, **Space Grotesk + DM Sans** for tech conferences.

> **The hero is a thesis.** Every hero section variant must express the event's world immediately. Not a generic heading. The organizer's event name, dates, and venue should appear within 5 seconds of loading.

From `ui-ux-pro-max` skill:

- **Touch targets ≥ 44px** on all interactive block controls
- **Motion conveys meaning** — block drag feedback, canvas drop zones, section reorder animations use **150–300ms ease-out**
- **One primary CTA per page** — the builder should visually de-prioritize secondary actions in the header bar
- **Dark mode tokens** — all event blocks use CSS custom properties (`--pri`, `--sec`, `--base`) to adapt to the organizer's portal theme at a glance

---

## PART 6 — Data Model for Event Components (Engineering View)

```typescript
interface EventDataSnapshot {
  // Core identity
  eventName: string;
  tagline?: string;
  startDate: string; // ISO 8601
  endDate: string;
  venue: {
    name: string;
    address: string;
    city: string;
    country: string;
    description?: string;
    photos?: string[];
    floorPlanUrl?: string;
    mapEmbedUrl?: string;
  };
  logo?: string;
  banner?: string;
  primaryColor?: string;

  // People
  speakers?: Speaker[];
  committee?: CommitteeMember[];
  organizer?: OrganizerProfile;

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

  // Meta
  snapshotId: string;
  snapshotCreatedAt: string; // ISO 8601
  disconnectedAt?: string;   // set when user clicks "Disconnect"
}
```

> Once `disconnectedAt` is set, the block editor **removes the "Re-import" option** and only allows manual editing. This is the clean break between live data and static content.

---

## Summary: What Makes Eventos Different

| Feature | Generic Builders (Wix, WordPress) | Event Platforms (Cvent, Whova) | **Eventos** |
|---------|----------------------------------|-------------------------------|-------------|
| Pre-designed sections | ✗ Widget library | ✗ Plain sections | ✅ 120+ premium sections |
| Event-specific components | ✗ | Basic | ✅ 15 complete families |
| Backend data import | ✗ | Live connection only | ✅ One-time static snapshot |
| Multi-layout variants per component | ✗ | ✗ | ✅ (Speakers: 9 variants) |
| Dark/light theme sync | Partial | ✗ | ✅ CSS var tokens |
| Responsive by default | Partial | ✗ | ✅ Mobile-first |
| Multi-page support | ✅ | ✗ | ✅ |
