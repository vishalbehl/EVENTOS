import * as React from "react"
import { cn } from "@/lib/utils"

const Label = React.forwardRef<
  HTMLLabelElement,
  React.LabelHTMLAttributes<HTMLLabelElement>
>(({ className, style, ...props }, ref) => (
  <label
    ref={ref}
    className={cn(
      "inline-flex items-center gap-1.5",
      "text-[12px] font-semibold leading-none tracking-wide",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
      "select-none cursor-default",
      className
    )}
    style={{
      color: "var(--color-text-secondary)",
      marginBottom: "6px",
      display: "block",
      ...style,
    }}
    {...props}
  />
))
Label.displayName = "Label"

export { Label }
