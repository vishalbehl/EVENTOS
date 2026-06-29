import * as React from "react"
import { cn } from "@/lib/utils"

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, style, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[100px] w-full px-3 py-2.5 text-[13px] font-medium",
          "placeholder:text-[var(--color-text-muted)]",
          "focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-y transition-all duration-150",
          className
        )}
        style={{
          background: "var(--color-surface-3)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-sm)",
          color: "var(--color-text-primary)",
          fontFamily: "var(--font-sans)",
          ...style,
        }}
        onFocus={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-primary-end)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 3px var(--color-primary-glow)";
        }}
        onBlur={e => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--color-border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
