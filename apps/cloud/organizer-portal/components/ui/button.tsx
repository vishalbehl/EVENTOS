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
    primary: "btn-primary border border-transparent hover:opacity-90",
    secondary: "btn-secondary bg-[color-mix(in_srgb,var(--card)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--sec)_10%,transparent)]",
    outline: "border border-default bg-transparent text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--pri)_8%,transparent)]",
    ghost: "btn-ghost border border-transparent hover:bg-[color-mix(in_srgb,var(--pri)_8%,transparent)]",
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
        "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
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
