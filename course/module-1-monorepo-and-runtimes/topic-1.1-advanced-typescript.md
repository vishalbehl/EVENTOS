# Module 1 - Topic 1.1: Advanced TypeScript 5+ Masterclass

## 1. Introduction & Learning Objectives
Welcome to **Topic 1.1**. In this chapter, you will master advanced TypeScript type engineering used across the EventOS monorepo ([apps/cloud/*](file:///d:/DEV/conf-platform/apps/cloud) and [packages/types](file:///d:/DEV/conf-platform/packages/types)).

### Learning Outcomes:
- Write robust generic types and interfaces for API request/response wrappers.
- Master mapped types, conditional types, and template literal types.
- Implement strict type guards and discriminated unions for state management.

---

## 2. Advanced Generics & Utility Types

### 2.1 Generic API Response Wrappers
In EventOS ([apps/cloud/command-center/lib/api-client.ts](file:///d:/DEV/conf-platform/apps/cloud/command-center/lib/api-client.ts)), API responses are wrapped in generic type structures:

```typescript
export interface ApiResponse<T> {
  data: T;
  status: number;
  message: string;
  timestamp: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
```

### 2.2 TypeScript Built-in Utility Types
- `Pick<T, K>`: Constructs a type by picking keys `K` from `T`.
- `Omit<T, K>`: Constructs a type by picking all keys except `K`.
- `Partial<T>`: Makes all properties in `T` optional.
- `Record<K, T>`: Constructs an object type with key type `K` and value type `T`.

Example: Creating DTOs (Data Transfer Objects):
```typescript
export interface Event {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  tenantId: string;
  createdAt: string;
}

// CreateEventDTO omits auto-generated system fields
export type CreateEventDTO = Omit<Event, 'id' | 'createdAt'>;

// UpdateEventDTO makes remaining fields optional
export type UpdateEventDTO = Partial<CreateEventDTO>;
```

---

## 3. Discriminated Unions & Type Guards

### 3.1 Discriminated Unions for UI State
Discriminated unions ensure type safety across asynchronous loading states in React:

```typescript
export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error };

function renderState(state: AsyncState<Event[]>) {
  switch (state.status) {
    case 'loading':
      return 'Loading events...';
    case 'success':
      // TypeScript automatically narrows `state` to have `.data`
      return `Loaded ${state.data.length} events`;
    case 'error':
      return `Error: ${state.error.message}`;
  }
}
```

### 3.2 Custom Type Guards (`is`)
```typescript
export function isApiError(obj: unknown): obj is ApiError {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'errorCode' in obj &&
    'statusCode' in obj
  );
}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Navigate to `packages/types/` in the codebase.
2. Create a generic utility type `Nullable<T>` that wraps all fields of an interface in `T | null`.
3. Test your type with `Event` DTOs.

---

## 5. Chapter Summary & Next Steps
You have mastered TypeScript generics, utility types, and discriminated unions. Next, move to **[Topic 1.2: Modern Asynchronous Python 3.13+](./topic-1.2-asynchronous-python.md)**.
