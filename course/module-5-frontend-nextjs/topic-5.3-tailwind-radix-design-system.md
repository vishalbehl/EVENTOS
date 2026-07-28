# Module 5 - Topic 5.3: Tailwind CSS, Radix UI & Micro-Animation Component Design

## 1. Introduction & Learning Objectives
Welcome to **Topic 5.3**. In this chapter, you will master production component engineering using **Tailwind CSS**, **Radix UI unstyled primitives**, and modern component patterns (`shadcn/ui`, `class-variance-authority`, `tailwind-merge`) ([packages/ui](file:///d:/DEV/conf-platform/packages/ui)).

### Learning Outcomes:
- Compose accessible UI design systems combining Radix UI primitives with Tailwind CSS.
- Use `cva` (class-variance-authority) for type-safe button and card variant styling.
- Create dark mode themes, glassmorphism aesthetics, and responsive layouts.

---

## 2. Type-Safe Variant Styling with `cva` & `cn`

In EventOS shared UI library ([packages/ui](file:///d:/DEV/conf-platform/packages/ui)):

```typescript
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        glass: "bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
```

---

## 3. Composing Accessible Radix UI Dialog Primitives

```tsx
import * as Dialog from "@radix-ui/react-dialog";
import { Cross2Icon } from "@radix-ui/react-icons";

export function EventModal({ isOpen, onClose, title, children }: any) {
  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 backdrop-blur-sm transition-opacity" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-background p-6 rounded-lg shadow-xl border">
          <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
          <div className="mt-4">{children}</div>
          <Dialog.Close className="absolute top-4 right-4 text-muted-foreground hover:text-foreground">
            <Cross2Icon className="h-4 w-4" />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
```

---

## 4. Practical Exercise & Self-Assessment

### Hands-On Exercise:
1. Open `packages/ui` and build a `Card` component supporting `glass` and `solid` variants using `cva`.
2. Export the component and consume it inside `apps/cloud/command-center`.

---

## 5. Chapter Summary & Next Steps
You have completed Module 5! You have mastered Next.js 14 App Router, Server Components, Zustand state management, TanStack Query caching, and Radix UI + Tailwind CSS component design systems. Next, move to **[Module 6 - Topic 6.1: Desktop Engineering with Electron & Vite](../module-6-offline-edge-electron/topic-6.1-electron-and-vite.md)**.
