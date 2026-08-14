# Aceternity source library

This folder is generated from the official Aceternity shadcn registry.

- Source registry: `https://ui.aceternity.com/registry/registry.json`
- Included scope: all `registry:ui` entries (109 at the current sync)
- Excluded scope: `registry:block`, Pro blocks, and paid templates
- Refresh command: `npm run sync:aceternity --workspace @eventos/website-builder-studio`
- Usage terms: `https://ui.aceternity.com/licence`

Each file in `registry/` contains the complete upstream registry payload, including React source, dependencies, author, and target path. `catalog.generated.ts` contains bundle-safe metadata used by the searchable builder library.

Aceternity components are React/Motion source, while the current website canvas persists framework-neutral `WebsiteDocument` JSON and exports static HTML/CSS. A component becomes insertable only after it has an EVENTOS manifest, editable property schema, canvas renderer, preview/export renderer, runtime dependency declaration, and a component-by-component fidelity review. Source-only entries remain previewable and searchable but are never inserted as dead markup or screenshots.
