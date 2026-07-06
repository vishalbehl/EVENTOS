"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"
import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, style, ...props }, ref) => (
  <SwitchPrimitives.Root
    ref={ref}
    className={cn(
      "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-all duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-mid)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:bg-[var(--color-primary-mid)]",
      "data-[state=checked]:border-[rgba(224,255,0,0.18)]",
      "data-[state=unchecked]:bg-[var(--color-surface-4)]",
      "data-[state=unchecked]:border-[var(--color-border)]",
      className
    )}
    style={{ ...style }}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out",
        "data-[state=checked]:translate-x-4",
        "data-[state=unchecked]:translate-x-0"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
