# Module 5 - Topic 5.2: Zustand State Stores, TanStack Query & Typed Axios Interceptors

## 1. Introduction & Learning Objectives
Welcome to **Topic 5.2**. In this chapter, you will master client-side state management (**Zustand**), server data fetching & caching (**TanStack Query v5**), and singleton Axios client wrappers ([apps/cloud/command-center/lib/api-client.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/lib/api-client.ts)).

### Learning Outcomes:
- Build Zustand state stores with persistence and SSR hydration safety.
- Cache, invalidate, and optimistically update server data using TanStack Query.
- Configure Axios interceptors for automatic JWT injection and `ApiError` normalization.

---

## 2. Zustand State Stores & Hydration Safety

In EventOS ([apps/cloud/command-center/CLAUDE.md](file:///d:/DEV/conf-platform/apps/cloud/command-center/CLAUDE.md#L123)), global auth state is stored in Zustand with hydration protection to prevent SSR mismatches:

```typescript
import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  user: User | null;
  token: string | null;
  hasHydrated: boolean;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  setHasHydrated: (state: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      hasHydrated: false,
      setAuth: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
      setHasHydrated: (state) => set({ hasHydrated: state }),
    }),
    {
      name: "eventos-auth-storage",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
```

---

## 3. Typed Axios Interceptors & TanStack Query Hooks

### 3.1 Singleton Axios Interceptor ([lib/api-client.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/lib/api-client.ts))
```typescript
import axios from "axios";

export const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000",
  headers: { "Content-Type": "application/json" },
});

// Request Interceptor: Inject Bearer Token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

### 3.2 TanStack Query Custom Hook
```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const response = await apiClient.get("/api/v1/events");
      return response.data;
    },
  });
}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Create a Zustand store `useNotificationStore`.
2. Write a TanStack Query mutation hook `useCreateEvent()` that invalidates `["events"]` cache on success.

---

## 5. Chapter Summary & Next Steps
You have mastered Zustand stores, hydration safety, TanStack Query caching, and Axios interceptors. Next, move to **[Topic 5.3: Tailwind CSS & Radix UI Component Design](./topic-5.3-tailwind-radix-design-system.md)**.
