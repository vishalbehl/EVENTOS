import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-all duration-150 select-none border",
  {
    variants: {
      variant: {
        default: "",
        secondary: "",
        outline: "",
        destructive: "",
        success: "",
        warning: "",
        info: "",
        muted: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, style, ...props }: BadgeProps) {
  const variantStyles: React.CSSProperties = (() => {
    switch (variant) {
      case "default":
      case undefined:
        return {
          background: "color-mix(in srgb, var(--color-primary-start) 15%, transparent)",
          color: "var(--color-primary-mid)",
          borderColor: "color-mix(in srgb, var(--color-primary-start) 30%, transparent)",
        };
      case "secondary":
        return {
          background: "var(--color-surface-3)",
          color: "var(--color-text-secondary)",
          borderColor: "var(--color-border)",
        };
      case "outline":
        return {
          background: "transparent",
          color: "var(--color-text-secondary)",
          borderColor: "var(--color-border)",
        };
      case "destructive":
        return {
          background: "var(--color-danger-muted)",
          color: "var(--color-danger)",
          borderColor: "color-mix(in srgb, var(--color-danger) 25%, transparent)",
        };
      case "success":
        return {
          background: "var(--color-success-muted)",
          color: "var(--color-success)",
          borderColor: "color-mix(in srgb, var(--color-success) 25%, transparent)",
        };
      case "warning":
        return {
          background: "var(--color-warning-muted)",
          color: "var(--color-warning)",
          borderColor: "color-mix(in srgb, var(--color-warning) 25%, transparent)",
        };
      case "info":
        return {
          background: "var(--color-info-muted)",
          color: "var(--color-info)",
          borderColor: "color-mix(in srgb, var(--color-info) 25%, transparent)",
        };
      case "muted":
        return {
          background: "var(--color-surface-3)",
          color: "var(--color-text-muted)",
          borderColor: "var(--color-border)",
        };
      default:
        return {};
    }
  })();

  return (
    <div
      className={cn(badgeVariants({ variant }), className)}
      style={{ ...variantStyles, ...style }}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
