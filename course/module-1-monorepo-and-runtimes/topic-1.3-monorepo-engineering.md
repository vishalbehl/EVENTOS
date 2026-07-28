# Module 1 - Topic 1.3: Monorepo Engineering & npm Workspaces

## 1. Introduction & Learning Objectives
Welcome to **Topic 1.3**. In this chapter, you will master enterprise monorepo management using `npm` workspaces, local package linking, shared code distribution, and task orchestration across multiple web applications.

### Learning Outcomes:
- Configure root `package.json` workspaces for multi-app architectures.
- Create shared workspace packages (`@conf-platform/types`, `@conf-platform/ui`).
- Orchestrate parallel development scripts across 10+ sub-projects.

---

## 2. npm Workspaces Configuration

### 2.1 Monorepo Layout
EventOS organizes frontends, edge apps, and shared libraries under a clean monorepo hierarchy ([package.json](file:///d:/DEV/conf-platform/package.json)):

```json
{
  "name": "conf-platform",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "apps/cloud/*",
    "apps/venue/*",
    "packages/*"
  ]
}
```

```
conf-platform/
├── apps/
│   ├── cloud/ (command-center, organiser-portal, speaker-portal, registration-portal)
│   └── venue/ (registration, kiosk-app, eposter-display, room-presentation, etc.)
└── packages/
    ├── types/ (@conf-platform/types)
    ├── ui/    (@conf-platform/ui)
    └── utils/ (@conf-platform/utils)
```

---

## 3. Shared Workspace Packages

### 3.1 Consuming Workspace Dependencies
To use `@conf-platform/types` inside `apps/cloud/command-center/package.json`:

```json
{
  "name": "command-center",
  "dependencies": {
    "@conf-platform/types": "workspace:*",
    "@conf-platform/ui": "workspace:*"
  }
}
```

This allows instant hot-reloading across shared TypeScript types and React components without requiring npm publishing.

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Inspect `packages/types/package.json`.
2. Add a new exported interface `UserRole` in `packages/types/src/index.ts`.
3. Import `UserRole` in `apps/cloud/command-center/app/page.tsx` and verify TypeScript autocomplete recognizes the new type across workspace boundaries.

---

## 5. Chapter Summary & Next Steps
You have mastered monorepo workspace configuration and shared package linking. Next, move to **[Module 2 - Topic 2.1: PostgreSQL 16 Data Modeling](../module-2-database-and-security/topic-2.1-postgresql-and-indexing.md)**.
