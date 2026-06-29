# Eventos — Enterprise Design System

> Premium dark SaaS dashboard design for event management platform  
> Version 1.0 · TypeScript + Node.js · Desktop-first

---

## 1. Design Philosophy

Eventos is built for professionals who live inside dashboards. Every design decision must serve clarity, speed, and confidence — not decoration. The aesthetic borrows from modern analytics platforms (Linear, Vercel, Raycast) while introducing warm violet-to-cyan energy that signals intelligence and live data.

**Three principles guide every component:**
1. **Data first** — numbers are always the largest element on a card
2. **Depth through layers** — dark surfaces use subtle glass effects, not flat color
3. **Motion with intent** — animations communicate state change, not just beauty

---

## 2. Color Tokens

### Base Surfaces
| Token | Hex | Usage |
|---|---|---|
| `--color-bg` | `#080B13` | Page background |
| `--color-surface-1` | `#0F1420` | Sidebar, base panels |
| `--color-surface-2` | `#141928` | Card backgrounds |
| `--color-surface-3` | `#1A2035` | Hover states, elevated cards |
| `--color-surface-4` | `#212840` | Active/selected states |
| `--color-border` | `#1F2A3D` | Dividers, card borders |
| `--color-border-subtle` | `#162030` | Section separators |

### Brand Gradient (Primary)
| Token | Hex | Usage |
|---|---|---|
| `--color-primary-start` | `#7C3AED` | Gradient start (violet) |
| `--color-primary-mid` | `#9B59F5` | Gradient mid |
| `--color-primary-end` | `#A855F7` | Gradient end (purple) |
| `--color-primary-glow` | `#7C3AED40` | Shadow/glow (25% opacity) |

### Accent
| Token | Hex | Usage |
|---|---|---|
| `--color-accent-cyan` | `#06B6D4` | Secondary actions, charts line 2 |
| `--color-accent-green` | `#10B981` | Positive delta, online status |
| `--color-accent-pink` | `#EC4899` | Leads metric, chart line 3 |
| `--color-accent-amber` | `#F59E0B` | Warnings, occupancy alerts |

### Text
| Token | Hex | Usage |
|---|---|---|
| `--color-text-primary` | `#F1F5F9` | Headlines, KPI values |
| `--color-text-secondary` | `#8B9EC7` | Labels, subtitles |
| `--color-text-muted` | `#4A5568` | Placeholders, disabled |
| `--color-text-inverse` | `#080B13` | Text on light buttons |

---

## 3. Typography

### Font Stack
```css
--font-display: 'Inter', system-ui, -apple-system, sans-serif;
--font-mono: 'JetBrains Mono', 'Fira Code', monospace;
```

### Type Scale
| Role | Size | Weight | Line-height | Usage |
|---|---|---|---|---|
| `kpi-value` | 36–48px | 800 | 1.0 | Dashboard stat numbers |
| `kpi-label` | 11px | 500 | 1.3 | Uppercase metric labels |
| `heading-1` | 24px | 700 | 1.2 | Page titles |
| `heading-2` | 18px | 600 | 1.3 | Section/card headers |
| `heading-3` | 14px | 600 | 1.4 | Card subtitles |
| `body` | 14px | 400 | 1.5 | General content |
| `body-sm` | 13px | 400 | 1.5 | Table content |
| `label` | 12px | 500 | 1.4 | Form labels, chips |
| `caption` | 11px | 400 | 1.3 | Timestamps, metadata |
| `mono` | 13px | 400 | 1.4 | IDs, codes, counts |

**KPI numbers** must always use `font-variant-numeric: tabular-nums` to prevent layout shift during live updates.

---

## 4. Spacing & Layout

### Base Grid
- **Sidebar width:** 220px (collapsed: 60px)
- **Content max-width:** 1440px
- **Grid:** 12 columns, 24px gap
- **Card padding:** 24px
- **Section gap:** 24px
- **Content padding:** 32px

### Spacing Scale (4px base unit)
```
4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128
```

### Border Radius
| Token | Value | Usage |
|---|---|---|
| `--radius-sm` | `6px` | Chips, badges, inputs |
| `--radius-md` | `10px` | Buttons, dropdowns |
| `--radius-lg` | `14px` | Cards, panels |
| `--radius-xl` | `20px` | Modals, large surfaces |
| `--radius-full` | `9999px` | Avatars, toggles, pills |

---

## 5. Component Specifications

### KPI Stat Card
```
┌─────────────────────────────────┐
│  VIEWS                     [icon]│  ← label (11px, uppercase, muted)
│  ─────────────────────────────  │
│  420                            │  ← value (42px, weight 800, primary)
│                                 │
│  ████████████████████           │  ← sparkline mini chart (40px tall)
│                                 │
│  ▲ 6.3%  vs last period         │  ← delta chip (12px, accent-green/red)
└─────────────────────────────────┘
```
- Background: `--color-surface-2`
- Border: `1px solid --color-border`
- Hover: surface lifts to `--color-surface-3`, border glows with `--color-primary-glow`
- Entrance animation: slide up 20px + fade in, staggered 80ms per card

### Line Chart Card
- Background: `--color-surface-2`
- Chart area: transparent fill with gradient from line color to `transparent`
- Tooltip: glass card with backdrop-filter blur(16px), surface-3 background
- Active dot: 8px white circle with 4px colored ring, subtle pulse animation
- Legend: inline colored dots (8px) + label (12px, secondary)

### Data Table
- Header row: `--color-surface-3`, text `--color-text-secondary`, 11px uppercase
- Body rows: alternate between `--color-surface-2` and transparent
- Hover row: `--color-surface-3` with 200ms transition
- Borders: only horizontal separators (1px, `--color-border-subtle`)
- Click-to-sort: animated caret icon

### Sidebar Navigation
```
┌──────────────┐
│ ⬡ EVENTOS   │  ← logo + brand name
│              │
│ Links        │  ← section header (10px, muted, uppercase)
│  ○ Dashboard │  ← active: violet left border + surface-4 bg
│  ○ Events    │
│  ○ Analytics │
│              │
│ Tools        │
│  ○ Team      │
│  ○ Settings  │
│              │
│ [upgrade box]│  ← gradient card at bottom
└──────────────┘
```
- Active item: 3px left border `--color-primary-end`, background `--color-surface-4`
- Hover: smooth `--color-surface-3` background, 150ms ease

### Button System
| Variant | Background | Text | Border |
|---|---|---|---|
| `primary` | gradient (primary-start → primary-end) | white | none |
| `secondary` | `--color-surface-3` | text-primary | `--color-border` |
| `ghost` | transparent | text-secondary | none |
| `danger` | `#EF44441A` | `#EF4444` | `#EF444433` |
| `success` | `#10B9811A` | `#10B981` | `#10B98133` |

All buttons: 10px radius, 12–14px text, 500 weight, 36px height (sm: 32px)

### Badge / Chip
- Positive delta: `--color-accent-green` background at 15% opacity, text at 100%
- Negative delta: red equivalent
- Status: colored dot (6px) + label text

---

## 6. Motion & Animation

### Principles
- **Enter animations** should feel physics-based, not linear
- **Data updates** should transition values (count-up effect for KPIs)
- **Hover states** must respond within 100ms
- Never animate layout — only opacity, transform, box-shadow

### Animation Tokens
```css
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* Spring for entrances */
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);          /* Material ease for transitions */
--ease-out: cubic-bezier(0, 0, 0.2, 1);               /* Exits, collapse */

--duration-fast: 120ms;    /* Hover, focus rings */
--duration-base: 200ms;    /* Button clicks, toggles */
--duration-slow: 350ms;    /* Panel opens, card entrances */
--duration-chart: 800ms;   /* Chart draw animations */
```

### Defined Animations
| Name | Description | Where |
|---|---|---|
| `slideUpFade` | translateY(20px) → 0 + opacity 0 → 1 | Cards on page load |
| `chartDraw` | SVG stroke-dashoffset animation | Line charts on render |
| `countUp` | Number increments from 0 to value | KPI values on load |
| `pulseRing` | Expanding ring on active chart dot | Live data indicator |
| `shimmer` | Moving gradient highlight | Loading skeleton |
| `cardHoverLift` | translateY(-2px) + box-shadow increase | Card hover |
| `sidebarItemSlide` | Width expand for active indicator | Nav active state |

### Reduced Motion
```css
@media (prefers-reduced-motion: reduce) {
  /* All animations disabled, transitions max 100ms */
}
```

---

## 7. Iconography

Use **Lucide React** icon set throughout — consistent 20px size at 1.5px stroke weight for all UI icons, 16px for inline/table icons. Never mix icon sets.

Color: `--color-text-secondary` default, `--color-text-primary` on active states.

---

## 8. Shadows & Elevation

```css
--shadow-card: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
--shadow-card-hover: 0 8px 30px rgba(0,0,0,0.4), 0 0 0 1px var(--color-primary-glow);
--shadow-modal: 0 25px 50px rgba(0,0,0,0.6);
--shadow-dropdown: 0 10px 40px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05);
--shadow-glow-primary: 0 0 20px rgba(124, 58, 237, 0.25);
--shadow-glow-cyan: 0 0 20px rgba(6, 182, 212, 0.2);
```

---

## 9. Dashboard Layout Structure

```
┌──────────────────────────────────────────────────────────────────┐
│  TOPBAR: Logo · Nav breadcrumb · Search · Notif · User avatar    │
├──────────┬───────────────────────────────────────────────────────┤
│          │  PAGE HEADER: Title · Date picker · Export · CTA      │
│          ├───────────────────────────────────────────────────────┤
│ SIDEBAR  │  KPI ROW: [Views] [Clicks] [Registrations] [Revenue]  │
│ 220px    ├───────────────────────────────────────────────────────┤
│          │  CHART ROW: [Line chart 8col] [Summary 4col]          │
│          ├───────────────────────────────────────────────────────┤
│          │  TABLE ROW: [Sources 7col]  [Devices donut 5col]      │
└──────────┴───────────────────────────────────────────────────────┘
```

---

## 10. Responsive Behavior

| Breakpoint | Behavior |
|---|---|
| `≥1440px` | Full layout, 4-column KPI row |
| `1280px` | Content area shrinks, spacing reduces |
| `1024px` | Sidebar collapses to icon-only (60px) |
| `768px` | (Tablet) Not primary target — sidebar becomes drawer |

---

## 11. Form & Input Standards

- Height: 40px
- Border: `1px solid --color-border`
- Background: `--color-surface-3`
- Focus ring: `2px solid --color-primary-end`, `--color-primary-glow` outer glow
- Placeholder: `--color-text-muted`
- Radius: `--radius-sm` (6px)

---

## 12. Glass Effect Utility

Used on: Tooltips, Modals, Dropdown menus, Floating panels

```css
.glass {
  background: rgba(20, 25, 40, 0.8);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
```

---

*Eventos Design System · Last updated June 2026*
