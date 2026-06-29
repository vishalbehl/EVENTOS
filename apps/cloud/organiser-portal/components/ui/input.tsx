import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, style, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex w-full px-3 py-2 text-[13px] font-medium",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          "placeholder:text-[var(--color-text-muted)]",
          "focus-visible:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "transition-all duration-150",
          className
        )}
        style={{
          height: "40px",
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
    );
  }
);
Input.displayName = "Input";

export { Input };
