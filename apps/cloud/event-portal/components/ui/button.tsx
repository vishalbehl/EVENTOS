import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline' | 'default' | 'danger' | 'success' | 'warning' | 'link';
  size?: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'default', asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    
    const variants = {
      default: "btn-primary bg-[var(--pri)] text-[var(--primary-contrast)] border border-[var(--pri)] hover:bg-[var(--brand-primary-hover)] hover:text-[var(--primary-contrast)] font-semibold shadow-xs",
      primary: "btn-primary bg-[var(--pri)] text-[var(--primary-contrast)] border border-[var(--pri)] hover:bg-[var(--brand-primary-hover)] hover:text-[var(--primary-contrast)] font-semibold shadow-xs",
      secondary: "btn-secondary bg-[var(--bg-surface-2)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] font-medium shadow-xs",
      outline: "bg-transparent text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] font-medium shadow-xs",
      ghost: "btn-ghost bg-transparent text-[var(--text-primary)] border border-transparent hover:bg-[var(--bg-surface-hover)] hover:text-[var(--text-primary)] font-medium",
      destructive: "btn-danger bg-[var(--status-danger)] text-white border border-transparent hover:opacity-90 hover:text-white font-semibold shadow-xs",
      danger: "btn-danger bg-[var(--status-danger)] text-white border border-transparent hover:opacity-90 hover:text-white font-semibold shadow-xs",
      success: "bg-[var(--status-success)] text-white border border-transparent hover:opacity-90 hover:text-white font-semibold shadow-xs",
      warning: "bg-[var(--status-warning)] text-white border border-transparent hover:opacity-90 hover:text-white font-semibold shadow-xs",
      link: "text-[var(--pri)] underline-offset-4 hover:underline p-0 h-auto bg-transparent border-0 font-medium",
    }
    
    const sizes = {
      default: "h-10 px-4 py-2",
      sm: "h-8 rounded-lg px-3 text-xs",
      lg: "h-11 rounded-lg px-8",
      icon: "h-10 w-10",
      "icon-sm": "h-8 w-8",
    }
    
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-lg text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50 cursor-pointer",
          variants[variant as keyof typeof variants] || variants.primary,
          sizes[size as keyof typeof sizes] || sizes.default,
          className
        )}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
