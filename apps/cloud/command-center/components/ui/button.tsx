import * as React from "react"
import { cn } from "@/lib/utils"

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { 
    variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline',
    size?: 'default' | 'sm' | 'lg' | 'icon'
  }
>(({ className, variant = 'primary', size = 'default', ...props }, ref) => {
  const variants = {
    primary: "btn-primary border border-[var(--pri)] hover:bg-[var(--brand-primary-hover)]",
    secondary: "btn-secondary bg-[var(--card)] hover:bg-[var(--bg-surface-hover)]",
    outline: "border border-default bg-transparent text-[var(--text)] hover:bg-[var(--bg-surface-hover)]",
    ghost: "btn-ghost border border-transparent hover:bg-[var(--bg-surface-hover)]",
    destructive: "btn-danger border border-transparent hover:bg-[color-mix(in_srgb,var(--dan)_18%,transparent)]",
  }
  
  const sizes = {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  }
  
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--text)]/20 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  )
})
Button.displayName = "Button"

export { Button }
