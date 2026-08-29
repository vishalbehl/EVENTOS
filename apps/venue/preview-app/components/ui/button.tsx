import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "destructive" | "outline" | "danger" | "action";
  size?: "default" | "sm" | "lg" | "icon" | "xl";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "default", ...props }, ref) => {
    const variants = {
      primary: "btn-primary border border-transparent hover:opacity-90",
      secondary: "btn-secondary bg-[color-mix(in_srgb,var(--card)_70%,transparent)] hover:bg-[color-mix(in_srgb,var(--sec)_10%,transparent)]",
      outline: "border border-default bg-transparent text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--pri)_8%,transparent)]",
      ghost: "btn-ghost border border-transparent hover:bg-[color-mix(in_srgb,var(--pri)_8%,transparent)]",
      destructive: "btn-danger border border-transparent hover:bg-[color-mix(in_srgb,var(--dan)_18%,transparent)]",
      danger: "bg-red-600 hover:bg-red-500 text-white font-bold",
      action: "bg-blue-600 hover:bg-blue-500 text-white font-bold",
    };

    const sizes = {
      default: "h-10 px-4 py-2 text-sm",
      sm: "h-8 rounded-lg px-3 text-xs",
      lg: "h-12 rounded-xl px-8 text-base",
      xl: "h-14 rounded-2xl px-10 text-lg font-bold",
      icon: "h-10 w-10 p-0",
    };

    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center rounded-xl font-medium ring-offset-background transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
