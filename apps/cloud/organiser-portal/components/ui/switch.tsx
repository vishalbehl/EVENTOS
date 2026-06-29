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
      "peer inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent",
      "transition-all duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      "focus-visible:ring-[var(--color-primary-end)] focus-visible:ring-offset-[var(--color-bg)]",
      "disabled:cursor-not-allowed disabled:opacity-50",
      // Checked = gradient violet; Unchecked = surface
      "data-[state=unchecked]:bg-[var(--color-surface-4)]",
      "data-[state=unchecked]:border-[var(--color-border)]",
      "h-5 w-9",
      className
    )}
    style={{
      // Checked state applied via inline — data-[state=checked] is hard to set inline,
      // so we use a CSS var approach via a stylesheet override below
      ...style,
    }}
    {...props}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block rounded-full bg-white shadow-md ring-0",
        "transition-transform duration-200 ease-in-out",
        "h-4 w-4",
        "data-[state=checked]:translate-x-4",
        "data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
