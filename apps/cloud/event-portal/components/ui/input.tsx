import * as React from "react"
import { cn } from "@/lib/utils"

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<
  HTMLInputElement,
  InputProps
>(({ className, type, ...props }, ref) => {
  return (
    <input
      type={type}
      className={cn(
        "input flex h-10 w-full rounded-lg px-3.5 py-2 text-sm text-[var(--text)] bg-[var(--bg-surface-2)] border border-[var(--border-default)] placeholder:text-[var(--muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      ref={ref}
      suppressHydrationWarning
      {...props}
    />
  )
})
Input.displayName = "Input"

export { Input }
