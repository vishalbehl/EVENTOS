# Module 5 - Topic 5.1: Next.js 14 App Router, Server Components & Layout Composition

## 1. Introduction & Learning Objectives
Welcome to **Topic 5.1**. In this chapter, you will master production web application development using **Next.js 14+ (App Router)**, React 18 Server Components (RSC), and nested layout composition ([apps/cloud/command-center](file:///d:/DEV/conf-platform/apps/cloud/command-center)).

### Learning Outcomes:
- Differentiate between React Server Components (RSC) and Client Components (`"use client"`).
- Structure file-system routes using Route Groups `(auth)`, `(dashboard)`, and dynamic segments `[id]`.
- Build nested layouts and streaming SSR loading fallbacks (`loading.tsx`, `Suspense`).

---

## 2. Next.js 14 App Router Hierarchy

```
apps/cloud/command-center/app/
├── (auth)/             # Route group for unauthenticated auth pages
│   ├── login/page.tsx
│   └── layout.tsx
├── (dashboard)/        # Route group for protected dashboard views
│   ├── events/
│   │   ├── page.tsx
│   │   └── [id]/page.tsx
│   └── layout.tsx      # Dashboard navigation header & sidebar layout
├── layout.tsx          # Root HTML/CSS layout wrapper
└── page.tsx            # Landing page
```

---

## 3. React Server Components vs Client Components

### 3.1 Server Component Example (Default)
Executes on the server at request time, sending 0KB JavaScript bundle to the browser:

```tsx
// app/(dashboard)/events/page.tsx (Server Component)
import { Suspense } from "react";
import EventListSkeleton from "@/components/event-list-skeleton";
import EventList from "@/components/event-list";

export default async function EventsPage() {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold tracking-tight mb-6">Event Dashboard</h1>
      <Suspense fallback={<EventListSkeleton />}>
        <EventList />
      </Suspense>
    </div>
  );
}
```

### 3.2 Client Component Example (`"use client"`)
Used for interactive state, event listeners (`onClick`), and browser APIs:

```tsx
"use client";

import { useState } from "react";

export default function InteractiveButton() {
  const [count, setCount] = useState(0);
  return (
    <button 
      onClick={() => setCount(count + 1)}
      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
    >
      Clicked {count} times
    </button>
  );
}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Open `apps/cloud/command-center/app/(dashboard)/events/[id]/page.tsx`.
2. Wrap a section of the page in a React `<Suspense>` boundary.
3. Test loading skeletons by throttling network speed in Chrome DevTools.

---

## 5. Chapter Summary & Next Steps
You have mastered Next.js 14 App Router conventions, RSCs, and layout composition. Next, move to **[Topic 5.2: State Management & TanStack Query](./topic-5.2-state-zustand-tanstack-query.md)**.
