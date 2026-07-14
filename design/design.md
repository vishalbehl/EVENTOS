# Conf Platform Superadmin Design System

## 1. Design thesis

**Graphite Command** is a premium enterprise control surface: quiet, exact, and operational. It combines a dark graphite navigation shell with cool porcelain work surfaces, disciplined typography, hairline structure, and a cobalt signal color reserved for decisions and active state.

The superadmin audience is responsible for tenants, billing, security, platform health, deployments, support, and commercial configuration. Every screen must answer three questions within five seconds:

1. Where am I?
2. What requires attention?
3. What can I safely do next?

The product should feel like an instrument panel, not a marketing site. Density is welcome; clutter is not.

## 2. Signature: the signal rail

The signature element is a narrow vertical **signal rail**. In navigation it marks the active workspace. In timelines, tables, and detail panels it carries status and progression. In motion it draws downward on first load, then becomes calm.

Use the rail only when it encodes current position, health, or sequence. Never use it as decoration.

## 3. Foundations

### Color

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `--canvas` | `#F4F6F8` | `#0D1015` | App background |
| `--surface` | `#FFFFFF` | `#151920` | Primary workspace |
| `--surface-raised` | `#FAFBFC` | `#1B2029` | Menus, dialogs, hover |
| `--ink` | `#111827` | `#F3F6FA` | Primary text |
| `--muted` | `#667085` | `#99A3B3` | Secondary text |
| `--line` | `#DDE2E8` | `#2B323D` | Dividers and boundaries |
| `--graphite` | `#11151C` | `#090B0F` | Global navigation shell |
| `--cobalt` | `#315EFB` | `#6F8DFF` | Primary action, focus, selection |
| `--amber` | `#C8811A` | `#F0B45B` | Attention and pending state |
| `--emerald` | `#16815D` | `#42C997` | Healthy and complete state |
| `--red` | `#C2414B` | `#F07882` | Destructive and critical state |

Rules:

- Cobalt is the only routine accent. It means selected, actionable, or focused.
- Amber is operational attention, not decoration.
- Red is reserved for destructive actions or confirmed failure.
- Avoid gradients in daily work surfaces. Use tonal elevation, borders, and typography.
- Never communicate status by color alone; pair color with text, icon, or shape.

### Typography

- **Display / headings:** Space Grotesk, 500–600. Used sparingly for page titles and major values.
- **Body / controls:** IBM Plex Sans, 400–600. The default interface voice.
- **Data / identifiers:** IBM Plex Mono, 400–500. Used for IDs, currency columns, timestamps, versions, and compact metadata.

Type scale:

| Role | Size / line | Weight |
|---|---|---|
| Display | 32 / 38 | 600 |
| Page title | 24 / 30 | 600 |
| Section title | 16 / 22 | 600 |
| Body | 14 / 21 | 400 |
| Control | 13 / 18 | 500 |
| Caption | 12 / 17 | 400 |
| Micro label | 10 / 14 | 600, uppercase, `0.08em` tracking |

Use sentence case. Headings name the area; descriptions explain scope or freshness. Avoid promotional language inside the app.

### Spacing and geometry

- Base unit: `4px`.
- Control heights: 32 compact, 36 default, 40 prominent.
- Page gutter: `clamp(20px, 3vw, 44px)`.
- Workspace maximum width: `1600px`; data tables may use full available width.
- Radius: 6px controls, 10px panels, 14px overlays. Pills only for tags, avatars, and compact status.
- Borders: 1px hairlines. Do not place borders around every group.
- Shadows: overlays only. Routine panels use borders or tonal contrast.

### Iconography

- Use Lucide-style 1.75px outline icons.
- Default sizes: 16px controls, 18px navigation, 20px standalone.
- Every unlabeled icon button requires a tooltip and accessible name.
- Do not use icons as ornaments. They must improve scanning or identify an action.

## 4. Layout system

```text
┌──────────────┬────────────────────────────────────────────────────┐
│ product rail │ global header: context / search / system / user   │
│ 240px / 72px ├────────────────────────────────────────────────────┤
│              │ breadcrumbs                                        │
│ grouped nav  │ page title                         primary action  │
│              │ scope / freshness / filters                        │
│ signal rail  ├────────────────────────────────────────────────────┤
│              │ primary workspace                                  │
│              │ table / chart / workflow + optional inspector      │
└──────────────┴────────────────────────────────────────────────────┘
```

- Desktop sidebar: 240px expanded, 72px collapsed.
- Header: 64px, sticky, translucent only when content scrolls beneath it.
- Mobile: sidebar becomes a modal drawer; header reduces to menu, context, and actions.
- Page hierarchy: breadcrumb → title/action row → scope/filter row → working surface.
- Do not add dashboard hero banners. Start with live operational context.

## 5. Components

### Navigation

- Group navigation by operator intent: Overview, Commercial, Operations, Platform, Governance.
- Active items use a cobalt signal rail, brighter text, and a subtle filled background.
- Collapsed navigation keeps tooltips and section separation.
- Breadcrumbs show hierarchy, not browser history. Truncate the middle on narrow screens.

### Buttons

- **Primary:** cobalt fill; one per region.
- **Secondary:** surface fill with line border.
- **Quiet:** text/icon only for low-emphasis actions.
- **Destructive:** red only at the confirmation point.
- Button labels use verbs: “Create tenant,” “Retry sync,” “Save changes.”
- Loading preserves width and replaces the leading icon with a spinner.

### Forms

- Labels always remain visible; placeholders are examples, never labels.
- Help text explains format or consequence. Error text states the fix.
- Focus uses a 2px cobalt ring with 2px offset.
- Group related fields with spacing and headings, not nested cards.
- Destructive or permission-changing toggles need consequence copy.

### Cards and panels

Cards exist only when the whole surface is selectable, draggable, or a self-contained object. Otherwise use sections and dividers.

- Metric cards: compact, with label, value, delta, and scope. Maximum four in one row.
- Entity cards: title, state, essential metadata, and one clear action.
- Panels: use a header/body/footer only when each region has a functional purpose.
- Hover motion is `translateY(-2px)` at most; no floating mosaics.

### Tables

- Tables are the primary enterprise work surface.
- Sticky header, optional sticky first column, row height 48–56px.
- Left-align language; right-align numbers and currency; use tabular numerals.
- Sorting is explicit. Filters appear above the table and summarize active scope.
- Row actions are visible on focus and hover, with a persistent overflow trigger on touch.
- Bulk selection reveals a contextual action bar without shifting the table.
- Include loading, empty, filtered-empty, error, and partial-data states.

### Status and feedback

- Status badge anatomy: semantic dot/icon + short label.
- Toasts confirm lightweight outcomes and auto-dismiss in 4–6 seconds.
- Persistent or risky failures stay inline near the affected object.
- Use banners only for page-wide impact.
- Progress steppers are for real ordered workflows, not decoration.

### Overlays

- Dialog: decisions and short forms, max 560px.
- Sheet/inspector: entity detail while preserving table context, 480–640px.
- Command palette: navigation and action search, centered, max 680px.
- Popover: small contextual choices only.
- Escape closes non-destructive overlays; focus is trapped and restored.

### Charts

- Prefer line, bar, and stacked bar charts with direct labels.
- Use the semantic palette consistently and avoid more than five series.
- Always provide scope, unit, and date range.
- Tooltips use mono numerals and include comparison context.
- Provide an accessible table or summary for critical data.

## 6. Motion system

Motion communicates hierarchy, continuity, and outcome.

| Token | Duration | Curve | Use |
|---|---:|---|---|
| Instant | 90ms | ease-out | Press, checkbox, hover color |
| Fast | 160ms | cubic-bezier(.2,.8,.2,1) | Menu, tooltip, small reveal |
| Standard | 240ms | cubic-bezier(.2,.8,.2,1) | Sheet, filter, layout transition |
| Emphasis | 420ms | cubic-bezier(.16,1,.3,1) | First-load orchestration, command palette |

Application motion:

1. On initial load the signal rail draws downward while the header and workspace resolve in a short stagger.
2. Sidebar collapse preserves spatial identity; labels fade before the rail width changes.
3. Table selection, filter chips, sheets, and dialogs animate from their point of cause.
4. Live values briefly tint, then settle—never pulse indefinitely except for a genuinely active process.

Rules:

- Animate opacity and transform; avoid animating layout-heavy properties where possible.
- No routine animation longer than 420ms.
- Never delay interaction for animation.
- Respect `prefers-reduced-motion`; remove transforms and orchestration while preserving state changes.

## 7. Accessibility and responsiveness

- Target WCAG 2.2 AA contrast.
- Minimum touch target: 44×44px on touch layouts; compact desktop controls may be 32px with sufficient separation.
- All controls are keyboard reachable with visible focus.
- Tables retain semantic markup; responsive tables scroll horizontally rather than turning every row into an unreadable card.
- Announce toasts and async states through live regions.
- Support 200% zoom without loss of action or content.
- At `< 760px`, use drawers, stacked title actions, and compact filters; preserve the data hierarchy.

## 8. Content voice

- Concise, factual, calm.
- Use recognizable operator language: tenant, subscription, deployment, invoice, role, incident.
- State freshness: “Updated 2 min ago,” “Synced from billing.”
- Errors explain recovery: “The invoice could not be retried. Verify the payment method, then try again.”
- Empty states invite the next action: “No tenants match these filters. Clear filters or create a tenant.”

## 9. Implementation rules

- Use semantic tokens; no raw color values in components.
- Maintain light and dark parity for every new component.
- Every component ships with default, hover, focus, active, disabled, loading, error, and empty states where relevant.
- Test at 1440px, 1024px, 768px, and 390px.
- Verify keyboard navigation, reduced motion, contrast, overflow, and long-content behavior.
- Prefer composition over variants. New variants require a real semantic distinction.

## 10. Design review checklist

- Can an operator identify location, attention, and next action in five seconds?
- Is there only one primary action per functional region?
- Does every use of color encode meaning?
- Could any card become a simpler section or row?
- Are live, mock, partial, and unavailable states visually distinct?
- Are numbers aligned and identifiers readable?
- Does motion explain a change or preserve context?
- Does the screen remain complete with reduced motion and keyboard-only use?
- Do loading, empty, error, permission-denied, and partial-data states exist?

