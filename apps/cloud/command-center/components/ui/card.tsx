import * as React from "react"
import { cn } from "@/lib/utils"

export type CardVariant = "default" | "inset" | "interactive" | "featured" | "critical"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & { variant?: CardVariant }
>(({ className, variant = "default", ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "card rounded-[var(--radius-panel)] text-[var(--text)] shadow-[var(--shadow-panel)]",
      variant === "inset" && "bg-[var(--bg-surface-3)] shadow-none",
      variant === "interactive" && "cursor-pointer rounded-[var(--radius-card)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--text-tertiary)] hover:shadow-[var(--shadow-card-hover)]",
      variant === "featured" && "rounded-[var(--radius-card)] border-[color-mix(in_srgb,var(--status-info)_24%,var(--border-default))]",
      variant === "critical" && "border-[color-mix(in_srgb,var(--status-danger)_28%,var(--border-default))] bg-[var(--status-danger-muted)]",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none tracking-normal text-[var(--text)]",
      className
    )}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-xs text-[var(--muted)]", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter }
