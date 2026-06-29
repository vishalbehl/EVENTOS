"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"
import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center p-1 gap-1",
      className
    )}
    style={{
      background: "var(--color-surface-3)",
      border: "1px solid var(--color-border)",
      borderRadius: "var(--radius-md)",
    }}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap px-4 py-1.5",
      "text-[12px] font-semibold uppercase tracking-[0.08em]",
      "transition-all duration-200 focus-visible:outline-none",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:text-white data-[state=active]:shadow-glow-primary",
      "data-[state=inactive]:text-[var(--color-text-muted)]",
      "data-[state=inactive]:hover:text-[var(--color-text-primary)]",
      className
    )}
    style={{
      borderRadius: "var(--radius-sm)",
    }}
    onMouseEnter={e => {
      if ((e.currentTarget as HTMLElement).dataset.state !== 'active') {
        (e.currentTarget as HTMLElement).style.background = "var(--color-surface-4)";
      }
    }}
    onMouseLeave={e => {
      if ((e.currentTarget as HTMLElement).dataset.state !== 'active') {
        (e.currentTarget as HTMLElement).style.background = "";
      }
    }}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-6 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 animate-fade-in",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
