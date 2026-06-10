# EventOS — Complete UI Design Walkthrough

> **A comprehensive document covering every UI component, page, and feature across the entire SaaS platform.**

---

## 1. Technology Stack & Design Foundation

### Frontend Stack
| Layer | Technology |
|---|---|
| Framework | **Next.js 14** (App Router) |
| Language | TypeScript |
| Styling | **Tailwind CSS** + CSS Custom Properties |
| Animation | **Framer Motion** (`motion`, `AnimatePresence`) |
| Icons | **Lucide React** |
| State | **Zustand** (persist middleware for auth) |
| Server State | **TanStack Query** (`@tanstack/react-query`) |
| Toast | **Sonner** |
| UI Primitives | Custom components built over **Radix UI** |

### Design System — CSS Custom Properties (Tokens)

All colors and surfaces are exposed as CSS variables, making the app fully theme-switchable at runtime:

```css
--base    /* Page background */
--surf    /* Sidebar / floating surface */
--card    /* Card background */
--pri     /* Primary accent (e.g. indigo) */
--sec     /* Secondary accent */
--text    /* Body text */
--muted   /* Subdued/helper text */
--border  /* Border color */
--dan     /* Danger/destructive color */
```

#### Available Themes (9 total)
Switched via the Header's `Palette` button — persisted to localStorage via `useTheme` hook:

| Theme Name | Primary Color |
|---|---|
| `void-indigo` | Indigo (#6366F1) |
| `obsidian-rose` | Purple (#C084FC) |
| `carbon-teal` | Teal (#14B8A6) |
| `amber-noir` | Amber (#F59E0B) |
| `slate-aurora` | Sky Blue (#38BDF8) |
| `forest-ink` | Green (#22C55E) |
| `copper-oxide` | Copper (#D97706) |
| `plasma-violet` | Violet (#8B5CF6) |
| `light` | Light mode (#ececf3) |

### Recurring Design Patterns
- **`glass-3d`**: glassmorphism utility class — `backdrop-blur`, `border-default`, semi-transparent bg
- **`neomorphic-inset`**: soft inset shadow for form inputs
- **`hover-lift-3d`**: subtle 3D lift hover effect on cards
- **Framer Motion** spring animations universally for menu open/close, card hover, modal entry

---

## 2. Application Route Architecture

```
app/
├── (auth)/               ← Public: Login page
│   └── page.tsx
├── (dashboard)/          ← Protected: all authenticated pages
│   ├── layout.tsx        ← DashboardLayout: Sidebar + Header
│   ├── dashboard/        ← Home / overview page
│   ├── events/           ← Events list + creation
│   │   ├── page.tsx
│   │   └── [eventId]/    ← Event-specific workspace
│   │       ├── page.tsx  ← Redirect dispatcher
│   │       ├── dashboard/
│   │       ├── speaker/  ← Speaker Presentation Desk workspace
│   │       │   ├── dashboard/
│   │       │   ├── sessions/
│   │       │   ├── rooms/
│   │       │   ├── speakers/
│   │       │   ├── files/
│   │       │   ├── eposters/
│   │       │   ├── emails/
│   │       │   ├── announcements/
│   │       │   ├── notifications/
│   │       │   ├── theme/
│   │       │   ├── email-designer/
│   │       │   ├── workflows/
│   │       │   └── settings/
│   │       └── registration/  ← On-Site Registration workspace
│   │           ├── dashboard/
│   │           ├── participants/
│   │           ├── review/
│   │           ├── form-builder/
│   │           ├── theme/
│   │           ├── template-designer/
│   │           ├── email-designer/
│   │           ├── emails/
│   │           ├── announcements/
│   │           ├── financials/
│   │           ├── certificates/
│   │           └── settings/
│   ├── analytics/        ← Org-level analytics
│   ├── users/            ← User management
│   ├── files/            ← File vault
│   ├── developer/        ← API Keys & OAuth console
│   ├── settings/         ← Global settings
│   ├── org/              ← Organisation management
│   ├── connections/      ← Integrations
│   ├── platform-admin/   ← Superadmin panel
│   ├── onboarding/
│   └── docs/
└── (public)/
```

---

## 3. Authentication Screen — `/` (Login Page)

**File**: [`app/(auth)/page.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(auth)/page.tsx)

### Visual Design
- Full-screen dark background (`var(--base)`)
- Animated radial gradient blob (primary color @ 13% opacity pulsing)
- Noise/grainy texture overlay from external SVG
- Two animated blob shapes in background (`animate-blob`)

### Login Card
- `glass-3d` surface, `rounded-[2.5rem]`, `p-10`
- Framer Motion entrance: `rotateX: 10 → 0`, `y: 20 → 0`, spring easing
- 3D flip logo animation: `rotateY: 180 → 0` on mount
- Brand mark: `Box` icon (Lucide) + **EventOS** text

### Form Flow (2 Steps)
**Step 1 — Credentials:**
- `Identity Terminal` email input with `Mail` icon (neomorphic inset, focus glow)
- `Access Key` password input with `Lock` icon
- Animated toggle for `Remember Me` (custom motion div slider, not native checkbox)
- `Initialize Shell` submit button: full-width, `rounded-full`, gradient shadow
- Dev Fast Login shortcut (dev environment only)

**Step 2 — Security animation:**
- Triggered on successful API response
- `ShieldCheck` identity validated message
- Animated fingerprint icon with pulsing blur glow
- 6 animated "OTP" style dots (decorative, no real 2FA yet)
- `Synchronizing...` spinner button while auto-redirecting to `/dashboard`

### Auth Store (`useAuthStore`)
**File**: [`store/use-auth-store.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/use-auth-store.ts)
- Zustand with `persist` middleware (key: `obsidian-auth-storage`)
- Persists: `user`, `accessToken`, `refreshToken`, `rememberMe`, `loginTime`, `lastActivity`
- Does NOT persist: `hasHydrated`
- Session policy: RememberMe = 15 days max, non-remember = 1 day, inactivity = 36 hours

---

## 4. Dashboard Layout — `(dashboard)/layout.tsx`

**File**: [`app/(dashboard)/layout.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/layout.tsx)

This is the **root shell** for all authenticated pages.

### Structure
```
┌──────────────────────────────────────────────────┐
│  Animated background wallpaper + radial gradient │
│                                                  │
│  ┌──────────┐  ┌────────────────────────────────┐│
│  │          │  │  Header (sticky, 100px tall)   ││
│  │ Sidebar  │  │────────────────────────────────││
│  │ (fixed)  │  │  [Impersonation banner]         ││
│  │          │  │  ┌──────────────────────────┐  ││
│  │          │  │  │  Page Content (rounded,  │  ││
│  │          │  │  │  glassmorphic card,       │  ││
│  │          │  │  │  scrollable)              │  ││
│  │          │  │  └──────────────────────────┘  ││
│  └──────────┘  └────────────────────────────────┘│
│                                          [AI Bot] │
└──────────────────────────────────────────────────┘
```

### Key Behaviors
1. **Auth guard**: Checks `isAuthenticated` + `accessToken`, redirects to `/` if missing
2. **Profile sync**: If authenticated but no `user` object, fetches `/api/v1/auth/me`
3. **Activity tracking**: Throttled (60s) activity updates to Zustand via mouse/keyboard/scroll
4. **Session expiry**: Checked on mount — logs out + redirects if expired
5. **Global timezone**: Fetches from `/api/v1/global-settings` on mount, stores in `localStorage`
6. **WebSocket**: Initialized via `useSocket()` hook
7. **Module Access Guard**: If visiting a disabled workspace (speaker/registration), renders a `Lock` icon error state with a redirect button
8. **Impersonation Banner**: Shows amber warning banner with "Exit impersonation" when `localStorage.getItem("eventos_impersonating_org")` is set

### Background Layers
1. App wallpaper texture (CSS `bg-app-wallpaper`)
2. Radial gradient centered at 74% 14% with primary color at 12%
3. Linear gradient overlay for depth

---

## 5. Sidebar Navigation Component

**File**: [`components/layout/Sidebar.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/layout/Sidebar.tsx)

### Collapse Behavior
- Animated with Framer Motion spring: `width: 288px ↔ 80px`
- Toggle button: `ChevronLeft / ChevronRight` with `whileHover: scale(1.05)`
- State stored in Zustand: `useUIStore.isSidebarCollapsed`

### Three Navigation Modes
The sidebar dynamically switches navigation sets based on URL context:

| Mode | Condition | Routes Shown |
|---|---|---|
| **Platform** | No `eventId` in URL | Home, Events, Analytics, Users, Developer, File Vault |
| **Speaker Desk** | URL contains `/speaker/` | Program, Speakers, Communication, Design Studio, Automation |
| **Registration** | URL contains `/registration/` | Attendees, Design Studio, Communication, Finance |

### Platform Routes
```
Home         → /dashboard
Events       → /events             (EVENTS_VIEW permission)
Analytics    → /analytics          (ANALYTICS_VIEW permission)
User Mgmt    → /users              (USERS_VIEW permission)
Developer    → /developer          (SETTINGS_EDIT permission)
File Vault   → /files
```

### Speaker Desk Routes (event-scoped)
```
OVERVIEW
  └─ Overview     → /events/[id]/speaker/dashboard

PROGRAM
  ├─ Sessions     → /events/[id]/speaker/sessions
  └─ Rooms        → /events/[id]/speaker/rooms

SPEAKERS
  ├─ Speakers     → /events/[id]/speaker/speakers
  ├─ File Monitor → /events/[id]/speaker/files
  └─ Posters      → /events/[id]/speaker/eposters

COMMUNICATION
  ├─ Campaigns    → /events/[id]/speaker/emails
  ├─ Announcements→ /events/[id]/speaker/announcements
  └─ Notifications→ /events/[id]/speaker/notifications

DESIGN STUDIO
  ├─ Theme Designer     → /events/[id]/speaker/theme
  └─ Email Designer     → /events/[id]/speaker/email-designer

AUTOMATION
  └─ Workflows    → /events/[id]/speaker/workflows
```

### Registration Routes (event-scoped)
```
OVERVIEW
  └─ Overview     → /events/[id]/registration/dashboard

ATTENDEES
  ├─ Participants → /events/[id]/registration/participants
  └─ Review Queue → /events/[id]/registration/review

DESIGN STUDIO
  ├─ Form Builder       → /events/[id]/registration/form-builder
  ├─ Theme Designer     → /events/[id]/registration/theme
  ├─ Template Designer  → /events/[id]/registration/template-designer
  └─ Email Designer     → /events/[id]/registration/email-designer

COMMUNICATION
  ├─ Campaigns    → /events/[id]/registration/emails
  └─ Announcements→ /events/[id]/registration/announcements

FINANCE
  └─ Financials   → /events/[id]/registration/financials
```

### Active State Styling
- Active route: gradient `from-[var(--pri)] to-[var(--sec)]`, white text, box shadow glow
- Inactive: `text-[var(--muted)]`, hover shifts to `text-[var(--text)]`, `bg-[var(--card)]/30`

### Collapsed Mode Behavior
- Route labels hidden; only icons shown (centered)
- Hovering a group shows a floating tooltip dropdown with all sub-items
- Sub-items in tooltip show primary-colored text when active

### Permission Filtering
All routes with a `permission` field are filtered through `usePermissions(eventId)`:
- Fetches `/me/permissions?event_id=...` via React Query
- `checkPermission(code)` is a memoized function
- Sections with all sub-items filtered out are completely hidden

---

## 6. Header Component

**File**: [`components/layout/Header.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/layout/Header.tsx)

### Layout (100px tall sticky bar)
```
[Box Icon] > [Breadcrumb Path]          [Clock | WebSocket] [Bell] [Palette] [?] | [Name + Avatar]
```

### Breadcrumbs
- Auto-generated from `usePathname()` splitting by `/`
- Event IDs are skipped in the label (UUID segment filtered out)
- Dashes converted to spaces for readability
- Last segment is `text-[var(--text)]`, earlier segments link to their path

### System Clock
- Live ticking clock, updates every 1 second via `setInterval`
- Timezone read from `localStorage["system-timezone"]` or defaults to `Asia/Kolkata`
- Listens to `"system-timezone-changed"` custom window event for live sync
- Only visible on `xl:` breakpoint (large screens)

### WebSocket Status Indicator (event-scoped only)
- Shown only when `eventId` is in the URL
- Green pulsing dot = connected (`bg-emerald-500 animate-ping`)
- Amber pulsing dot = offline (`bg-amber-500 animate-pulse`)
- Label: **"Live Sync"** / **"Sync Off"**

### Theme Picker
- `Palette` icon opens an animated dropdown (`AnimatePresence`, spring)
- 9 color swatches in a 5-column grid
- Clicking a swatch calls `setTheme(name)` and closes the menu
- Active theme has scaled + bordered swatch

### User Menu
- Displays user's `full_name` + `role` (formatted from snake_case)
- DiceBear avatar fallback if no `avatar_url` (`lorelei` style, seeded by email)
- Dropdown (click to toggle, close on outside click via `useRef`):
  - View Profile → `/settings?tab=profile`
  - Global Settings → `/settings`
  - Sign Out → calls `logout()` from `useAuthStore`

### Notification Bell
- Links to `/notifications` (or `/events/[id]/speaker/notifications` if in event context)
- Red dot indicator (always shown — pending real notification count)

---

## 7. Events List Page — `/events`

**File**: [`app/(dashboard)/events/page.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/events/page.tsx)

### Page Layout
```
┌─ Header: "All Events" + "Create New Event" button ─────┐
│                                                         │
│  ┌─ Glass toolbar: [Search] [Grid/List toggle] [Filter] ┐│
│  │                                                      ││
│  └──────────────────────────────────────────────────────┘│
│                                                         │
│  Grid / List of Events (scrollable, overflow-y-auto)    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### View Modes
- **Grid (Card) View**: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4` 
- **List (Table) View**: Full-width glass table with header row

### Event Card Component (`EventCard`)
- Framer Motion hover: `y: -8`, `rotateX: 2`, `rotateY: 2` (3D tilt)
- Gradient hover border glow and bg flare in top-right corner
- Status badge colors:
  - `active`: emerald
  - `draft`: blue
  - `completed`: purple
  - `archived`: zinc
- On hover: Edit + Delete buttons fade in at bottom; chevron arrow shows

### Event Selection Flow (Workspace Picker)
When clicking an event that has **both** modules enabled:
- A glassmorphic modal slides up (Framer Motion spring)
- Two cards side-by-side:
  - **Speaker Presentation Desk** → navigates to `/events/[id]/speaker/dashboard`
  - **On-Site Registration & Printing** → navigates to `/events/[id]/registration`
- Decorative light flare in top-right corner of modal

### Loading State
- 8 `Skeleton` components in same grid layout, animated pulse

### Empty State
- Centered icon + message + "Clear Filters" button

---

## 8. Create/Edit Event Dialog

**File**: [`components/CreateEventDialog.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/CreateEventDialog.tsx)

### Architecture
- Full-screen modal: animated backdrop `z-[200]` + dialog `z-[210]`
- Framer Motion: `scale: 0.95 → 1`, `y: 20 → 0` entrance
- Max height `95vh`, scrollable form body via `overflow-y-auto no-scrollbar`

### Form Sections

#### Basic Info
- Event Name (required, `Sparkles` icon)
- Short Code (required, uppercase forced, max 10 chars, monospace font, `Hash` icon)
- Venue Center Name

#### Location
- Country dropdown (populated from `fetchCountryStates()` utility)
- State/Province dropdown (filtered by selected country, disabled until country selected)
- Street/City details (free text)

#### Organizer Contact Info
- Glass-3d card panel with 4 fields: Name, Email, Phone, Website

#### Dates & Timezone
- Start Date (date picker, `[color-scheme:dark]` for native dark styling)
- End Date
- Timezone selector (10 common IANA zones)

#### Event Features & Modes
- Two toggle switches (Radix UI `Switch`):
  - **Speaker Presentation Desk**: enable/disable entire speaker module
  - **On-Site Registration & Badges**: enable/disable registration module
  - Constraint: at least one must remain enabled (prevented at UI level)

### Behaviors
- Edit mode: pre-fills all fields from `eventToEdit` prop
- Create mode: uses global timezone from API as default
- Body scroll locked when dialog open (`document.body.style.overflow = 'hidden'`)

---

## 9. State Management Architecture

### Zustand Stores

| Store File | Purpose |
|---|---|
| [`use-auth-store.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/use-auth-store.ts) | Authentication state, session management |
| [`useUIStore.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/useUIStore.ts) | `isSidebarCollapsed`, UI preferences |
| [`useEventStore.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/useEventStore.ts) | Selected event context |
| [`useModalStore.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/useModalStore.ts) | Global modal open/close state |
| [`useNotificationStore.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/useNotificationStore.ts) | In-app notification messages |
| [`useFloatingToolbarStore.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/useFloatingToolbarStore.ts) | FloatingToolbar visibility |

### React Query (Server State)

All API fetches use `@tanstack/react-query`:

| Hook | Fetches |
|---|---|
| `useEvents(filters)` | Events list with optional status/search filter |
| `useEvent(id)` | Single event detail (used in sidebar for module flags) |
| `useCreateEvent()` | Mutation: POST /events |
| `useUpdateEvent(id)` | Mutation: PUT /events/[id] |
| `useDeleteEvent()` | Mutation: DELETE /events/[id] |
| `useSessions(eventId)` | Sessions list |
| `useSpeakers(eventId)` | Speakers list |
| `useRooms(eventId)` | Rooms list |
| `useFiles(eventId)` | File monitoring list |
| `usePosters(eventId)` | E-posters list |
| `usePermissions(eventId?)` | User's RBAC permission codes |
| `useEmails(eventId)` | Email campaigns |

---

## 10. Custom React Hooks

| Hook | Purpose |
|---|---|
| [`usePermissions(eventId?)`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/usePermissions.ts) | Fetch + memoize RBAC permission checks |
| `usePermission(code, eventId?)` | Shorthand single permission check |
| [`useTheme()`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/useTheme.ts) | Read/write active theme, list all themes |
| [`useWebSocket(eventId)`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/useWebSocket.ts) | WebSocket connection state (`isConnected`) |
| [`useSocket()`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/use-socket.ts) | Initialize WS on dashboard mount |
| `useEvents(filters)` | Events CRUD + list query |
| `useSpeakers(eventId)` | Speakers CRUD |
| `useSessions(eventId)` | Sessions CRUD |
| `useRooms(eventId)` | Rooms CRUD |
| `useFiles(eventId)` | File monitoring |
| `usePosters(eventId)` | E-posters |
| `useEmails(eventId)` | Email campaigns |
| `useToast()` | Re-export of Sonner toast |

---

## 11. API Client Layer

**File**: `lib/api-client.ts`

- Axios wrapper pre-configured with `NEXT_PUBLIC_API_URL` base URL
- Automatically attaches `Authorization: Bearer <token>` from `localStorage`
- Typed helpers: `apiGet<T>()`, `apiPost<T>()`, `apiPut<T>()`, `apiDelete<T>()`
- All calls go to `/api/v1/...` endpoints

---

## 12. Shared UI Component Library

**Directory**: [`components/ui/`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/ui)

| Component | Built On | Usage |
|---|---|---|
| `button.tsx` | Radix Slot + CVA | All CTA, icon, ghost, outline buttons |
| `input.tsx` | Native `<input>` | All form text inputs |
| `textarea.tsx` | Native `<textarea>` | Multi-line form inputs |
| `dialog.tsx` | Radix Dialog | Confirmation dialogs |
| `dropdown-menu.tsx` | Radix DropdownMenu | Context menus |
| `select.tsx` | Radix Select | Form dropdowns |
| `tabs.tsx` | Radix Tabs | Tab navigation |
| `badge.tsx` | Span + CVA | Status pills |
| `card.tsx` | Div wrappers | Card containers |
| `avatar.tsx` | Radix Avatar | User avatars with fallback |
| `switch.tsx` | Radix Switch | Toggle switches |
| `skeleton.tsx` | Div + animate-pulse | Loading placeholders |
| `scroll-area.tsx` | Radix ScrollArea | Custom scrollbars |
| `label.tsx` | Radix Label | Form labels |
| `portal.tsx` | Radix Portal | Render outside DOM tree |
| `Tooltip.tsx` | Custom | Icon tooltips |
| `AiFloatingAssistant.tsx` | Custom | EventX AI chat panel |

---

## 13. AI Floating Assistant — EventX

**File**: [`components/ui/AiFloatingAssistant.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/ui/AiFloatingAssistant.tsx)

### Location
- Fixed bottom-right corner of every dashboard page (`fixed bottom-6 right-6 z-[9999]`)

### Launcher Button
- Round `h-14 w-14` button with `animate-pulse-slow`
- Toggles between `MessageSquare` and `X` icon
- Primary color gradient with shadow

### Chat Panel (when open)
- `w-[380px] h-[520px]`, glassmorphic `backdrop-blur-xl` surface
- `animate-in zoom-in-95 duration-200` entrance

### Features
1. **Session persistence**: Conversation ID saved to `sessionStorage["eventos_ai_conv"]`
2. **Message history**: Loaded from API on re-open
3. **Citations**: Expandable "Sources & Citations" section per AI reply (similarity scores)
4. **Re-indexing**: `RefreshCw` button in header triggers `/api/v1/ai/index` POST
5. **RAG**: Responses include entity-level semantic citations (session, speaker, track types)

### API Endpoints Used
- `POST /api/v1/ai/conversations` — create conversation
- `GET /api/v1/ai/conversations/{id}/messages` — load history
- `POST /api/v1/ai/conversations/{id}/messages` — send message
- `POST /api/v1/ai/index` — trigger semantic reindexing

---

## 14. Developer Console — `/developer`

**File**: [`app/(dashboard)/developer/page.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/developer/page.tsx)

### Access
- Requires `SETTINGS_EDIT` permission
- Available in platform navigation (not event-scoped)

### Overview Cards (3-column grid)
| Card | Color | Shows |
|---|---|---|
| Active API Keys | Violet | Count of registered keys |
| OAuth Applications | Blue | Count of registered clients |
| Gateway Status | Emerald | "Operational" with ping dot |

### Tab Navigation
Two tabs with colored underline indicator:
- **API Keys** (violet) — server-to-server auth
- **OAuth Applications** (blue) — user-authorized scopes

### API Keys Panel
- Table: Name, Token Prefix (shown as `evnt_...`), Created, Expires, Last Used, Revoke action
- Empty state: icon + description
- **Generate API Key Modal**:
  - Key name input
  - Expiry selector: 7 days / 30 days / 90 days / Never
  - On success: shows plaintext key with **one-time display warning** (rose alert)
  - Copy button with check-mark confirmation
  - "I have saved it" dismiss button

### OAuth Applications Panel
- Table: App name, Client ID (with copy button), Redirect URIs, Created, Delete action
- **Register OAuth Application Modal**:
  - Application name input
  - Redirect URIs textarea (comma-separated)
  - On success: shows Client ID + Client Secret with one-time warning
  - Copy buttons for both credentials

---

## 15. Speaker Workspace Features

Accessible at `/events/[eventId]/speaker/...`

### Speaker Dashboard (`/speaker/dashboard`)
Overview metrics, event summary, recent activity

### Sessions (`/speaker/sessions`)
- Session list with filters
- CRUD operations via `useSessions` hook
- Room assignment, time slots, track tags

### Rooms (`/speaker/rooms`)
- Room list management via `useRooms` hook
- Capacity, location details

### Speakers (`/speaker/speakers`)
- Speaker directory via `useSpeakers` hook
- Upload presentations, profile photos
- Speaker categories and biography

### File Monitoring (`/speaker/files`)
- File upload tracking via `useFiles` hook
- Validation status per file
- Preview and download capability

### E-Posters (`/speaker/eposters`)
- Electronic poster management via `usePosters` hook
- Preview with modal viewer

### Email Campaigns (`/speaker/emails`)
- Campaign management via `useEmails` hook
- Send/schedule emails to speakers

### Announcements (`/speaker/announcements`)
- Broadcast messages to speaker portal

### Notifications (`/speaker/notifications`)
- In-platform notification management

### Theme Designer (`/speaker/theme`)
- Visual customization for speaker portal

### Email Designer (`/speaker/email-designer`)
- Drag-and-drop email template builder

### Workflows (`/speaker/workflows`)
- Automated workflow triggers and actions

### Settings (`/speaker/settings`)
- Speaker module configuration

---

## 16. Registration Workspace Features

Accessible at `/events/[eventId]/registration/...`

### Registration Dashboard (`/registration/dashboard`)
- Registrant counts, revenue summary, check-in stats

### Participants (`/registration/participants`)
- Full attendee list with search and filtering
- Export, bulk actions, QR code generation

### Review Queue (`/registration/review`)
- Pending registrations awaiting approval
- Accept / reject with notes

### Form Builder (`/registration/form-builder`)
- Drag-and-drop custom registration form fields
- Field types: text, select, checkbox, file upload

### Theme Designer (`/registration/theme`)
- Customise the public-facing registration portal colors, fonts, logo

### Template Designer (`/registration/template-designer`)
- Badge and certificate layout editor

### Email Designer (`/registration/email-designer`)
- Confirmation and notification email builder

### Email Campaigns (`/registration/emails`)
- Mass communication to registered attendees

### Announcements (`/registration/announcements`)
- Event-day broadcasts to attendees

### Financials (`/registration/financials`)
- Revenue breakdown, pricing tiers, refunds

### Certificates (`/registration/certificates`)
- Attendance certificate generation and distribution

### Settings (`/registration/settings`)
- Registration rules: allowed types, capacity, closing date, approval flow

---

## 17. Platform-Level Pages

### Home Dashboard (`/dashboard`)
- Org-level overview: total events, users, activity

### Analytics (`/analytics`)
- Cross-event analytics (requires `ANALYTICS_VIEW` permission)

### User Management (`/users`)
- List all org members, invite, manage roles
- Requires `USERS_VIEW` permission

### File Vault (`/files`)
- Org-wide file storage management

### Organisation Settings (`/org`)
- Org name, logo, billing, plan details

### Platform Admin (`/platform-admin`)
- Superadmin-only panel for multi-tenant management
- Org impersonation feature (sets `localStorage["eventos_impersonating_org"]`)

### Global Settings (`/settings`)
- Personal profile, timezone, notification preferences

### Connections (`/connections`)
- Third-party integrations (Webhooks, Zoom, Stripe, etc.)

### Documentation (`/docs`)
- In-app documentation viewer

---

## 18. Permission System (RBAC)

### Frontend Permission Codes (`lib/permissions.ts`)

Key codes used across the app:
```typescript
PERMISSIONS.EVENTS_VIEW      // See events list
PERMISSIONS.SESSIONS_VIEW    // See sessions
PERMISSIONS.SPEAKERS_VIEW    // See speakers
PERMISSIONS.FILES_VIEW       // File monitoring
PERMISSIONS.POSTERS_VIEW     // E-poster access
PERMISSIONS.ROOMS_MANAGE     // Room CRUD
PERMISSIONS.ANALYTICS_VIEW   // Analytics page
PERMISSIONS.USERS_VIEW       // User management
PERMISSIONS.SETTINGS_EDIT    // Settings + Developer console
```

### How Permissions Flow
1. **Layout** mounts → **`usePermissions(eventId)`** fires TanStack Query
2. API: `GET /me/permissions?event_id=...` returns `{ permissions: string[] }`
3. `checkPermission(code)` is memoized with `useMemo`
4. **Sidebar** filters routes before render — items the user cannot access never appear in DOM
5. **Individual pages** can additionally call `usePermission(code)` for component-level gating

---

## 19. Real-Time Features (WebSocket)

### Connection
- Initialized on every dashboard page mount via `useSocket()`
- Event-scoped connection established when `eventId` is present

### Status
- `useWebSocket(eventId)` returns `{ isConnected: boolean }`
- Header displays live indicator: **"Live Sync"** vs **"Sync Off"**

### Use Cases
- Live updates when speakers upload files
- Real-time check-in counter updates on registration dashboard
- Notification delivery without page refresh

---

## 20. Component Data Flow Diagram

```
                    ┌─────────────────┐
                    │  useAuthStore   │ ← localStorage (persisted)
                    │  (Zustand)      │
                    └────────┬────────┘
                             │ user, accessToken
                    ┌────────▼────────┐
                    │ DashboardLayout │
                    │  (layout.tsx)   │
                    └────────┬────────┘
               ┌─────────────┼──────────────┐
               │             │              │
       ┌───────▼──────┐  ┌───▼────┐  ┌─────▼────────┐
       │   Sidebar    │  │ Header │  │  Page Content │
       │              │  │        │  │               │
       │ useUIStore   │  │useTheme│  │  React Query  │
       │ usePermissions│  │useAuth │  │  hooks (data) │
       │ useEvent     │  │        │  │               │
       └──────────────┘  └────────┘  └───────────────┘
                                              │
                              ┌───────────────▼──────────────┐
                              │         api-client.ts         │
                              │  (Axios + Bearer Token)        │
                              └───────────────┬───────────────┘
                                              │
                              ┌───────────────▼───────────────┐
                              │    FastAPI Backend             │
                              │    /api/v1/...                 │
                              └───────────────────────────────┘
```

---

## 21. Responsive Design Notes

| Breakpoint | Behavior |
|---|---|
| Mobile (`< md`) | Sidebar hidden; main content full-width |
| Tablet (`md`) | Sidebar visible, fixed, 288px or 80px collapsed |
| Desktop (`xl`) | System clock visible in header |

- All grids use responsive column counts: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`
- Event card actions hidden until hover (opacity 0 → 100)
- Header breadcrumbs overflow hidden with `overflow-hidden`
- User name text in header hidden on small screens (`hidden sm:block`)

---

## 22. Animation Inventory

| Animation | Library | Usage |
|---|---|---|
| Sidebar collapse | `framer-motion` spring | Width 288 ↔ 80 |
| Sidebar submenu expand | `framer-motion` height animate | 0 ↔ auto |
| Nav item hover | `framer-motion` whileHover x: 4 | All sidebar links |
| Login card entrance | `framer-motion` y + scale + rotateX | Login page |
| Logo 3D flip | `framer-motion` rotateY 180 → 0 | Login brand mark |
| Form step transition | `framer-motion` AnimatePresence x slide | Login step 1 → 2 |
| Modal backdrop | `framer-motion` opacity | All modals |
| Modal dialog | `framer-motion` scale + y | All modals |
| Event card hover | `framer-motion` whileHover y:-8 + rotateX/Y | Events grid |
| Header dropdown | `framer-motion` opacity + y + scale | Theme/user menus |
| Workspace picker | `framer-motion` spring scale + y | Event workspace modal |
| AI chat panel | `animate-in zoom-in-95` | Chat window open |
| Button press | `framer-motion` whileTap scale | Sidebar toggle |

---

## 23. File & Directory Reference

| Path | Purpose |
|---|---|
| [`app/(auth)/page.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(auth)/page.tsx) | Login screen |
| [`app/(dashboard)/layout.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/layout.tsx) | Root authenticated layout |
| [`app/(dashboard)/events/page.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/events/page.tsx) | Events listing |
| [`app/(dashboard)/developer/page.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/(dashboard)/developer/page.tsx) | Developer console |
| [`components/layout/Sidebar.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/layout/Sidebar.tsx) | Navigation sidebar |
| [`components/layout/Header.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/layout/Header.tsx) | Top header bar |
| [`components/layout/EventSelector.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/layout/EventSelector.tsx) | Event context switcher |
| [`components/CreateEventDialog.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/CreateEventDialog.tsx) | Create/edit event modal |
| [`components/ui/AiFloatingAssistant.tsx`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/ui/AiFloatingAssistant.tsx) | EventX AI chat |
| [`components/ui/`](file:///D:/DEV/conf-platform/apps/cloud/command-center/components/ui) | Shared primitive UI components |
| [`store/use-auth-store.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/use-auth-store.ts) | Auth Zustand store |
| [`store/useUIStore.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/store/useUIStore.ts) | UI state Zustand store |
| [`hooks/usePermissions.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/usePermissions.ts) | RBAC permission hook |
| [`hooks/useEvents.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/useEvents.ts) | Events data + mutations |
| [`hooks/useTheme.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/hooks/useTheme.ts) | Theme switching |
| [`lib/api-client.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/lib/api-client.ts) | Axios API wrapper |
| [`app/globals.css`](file:///D:/DEV/conf-platform/apps/cloud/command-center/app/globals.css) | Global CSS + theme tokens |
| [`tailwind.config.ts`](file:///D:/DEV/conf-platform/apps/cloud/command-center/tailwind.config.ts) | Tailwind configuration |
