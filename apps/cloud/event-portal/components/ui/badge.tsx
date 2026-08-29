import * as React from "react"
import { cn } from "@/lib/utils"

const Badge = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: 'default' | 'secondary' | 'outline' | 'destructive' | 'danger' | 'success' | 'warning' | 'info' | 'muted' | 'purple' | 'cyan' | 'lime' }
>(({ className, variant = 'default', ...props }, ref) => {
  const variants = {
    default: "border-[color-mix(in_srgb,var(--pri)_35%,transparent)] bg-[color-mix(in_srgb,var(--pri)_20%,transparent)] text-[var(--sec)]",
    secondary: "border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted",
    outline: "border-default text-[var(--text)]",
    destructive: "border-[color-mix(in_srgb,var(--dan)_30%,transparent)] bg-[color-mix(in_srgb,var(--dan)_12%,transparent)] text-[var(--dan)]",
    danger: "border-[color-mix(in_srgb,var(--dan)_30%,transparent)] bg-[color-mix(in_srgb,var(--dan)_12%,transparent)] text-[var(--dan)]",
    success: "border-[color-mix(in_srgb,var(--success)_35%,transparent)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[var(--success)]",
    warning: "border-[color-mix(in_srgb,var(--warn)_35%,transparent)] bg-[color-mix(in_srgb,var(--warn)_15%,transparent)] text-[var(--warn)]",
    info: "border-[color-mix(in_srgb,var(--acc)_35%,transparent)] bg-[color-mix(in_srgb,var(--acc)_15%,transparent)] text-[var(--acc)]",
    muted: "border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-muted",
    purple: "border-default bg-[color-mix(in_srgb,var(--pri)_15%,transparent)] text-[var(--text)]",
    cyan: "border-default bg-[color-mix(in_srgb,var(--sec)_15%,transparent)] text-[var(--sec)]",
    lime: "border-default bg-[color-mix(in_srgb,var(--text)_5%,transparent)] text-[var(--text)]",
  }
  
  return (
    <div
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
        variants[variant as keyof typeof variants] || variants.default,
        className
      )}
      {...props}
    />
  )
})
Badge.displayName = "Badge"

export { Badge }
