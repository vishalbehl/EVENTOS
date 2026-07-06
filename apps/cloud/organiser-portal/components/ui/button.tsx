import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[13px] font-semibold tracking-wide ring-offset-background transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 select-none",
  {
    variants: {
      variant: {
        default:
          "text-white border-0 shadow-glow-primary active:scale-[0.97]",
        primary:
          "text-white border-0 shadow-glow-primary active:scale-[0.97]",
        secondary:
          "border active:scale-[0.97]",
        outline:
          "border active:scale-[0.97]",
        ghost:
          "active:scale-[0.97]",
        link:
          "underline-offset-4 hover:underline",
        danger:
          "border font-semibold active:scale-[0.97]",
        destructive:
          "border font-semibold active:scale-[0.97]",
        success:
          "border font-semibold active:scale-[0.97]",
        warning:
          "border font-semibold active:scale-[0.97]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm:      "h-7 px-3 text-[12px]",
        lg:      "h-11 px-6 text-[14px]",
        icon:    "h-9 w-9",
        "icon-sm": "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    // Apply inline styles based on variant
    const variantStyles: React.CSSProperties = (() => {
      switch (variant) {
        case "default":
        case "primary":
        case undefined:
        case null:
          return {
            background: "linear-gradient(135deg, var(--color-primary-start), var(--color-primary-end))",
            color: "var(--color-text-inverse)",
            border: "1px solid rgba(224, 255, 0, 0.2)",
            boxShadow: "0 14px 32px rgba(224, 255, 0, 0.14)",
          };
        case "secondary":
          return {
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "var(--color-text-primary)",
          };
        case "outline":
          return {
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "var(--color-text-primary)",
          };
        case "ghost":
          return {
            background: "transparent",
            border: "none",
            color: "var(--color-text-secondary)",
          };
        case "danger":
        case "destructive":
          return {
            background: "var(--color-danger-muted)",
            border: "1px solid color-mix(in srgb, var(--color-danger) 30%, transparent)",
            color: "var(--color-danger)",
          };
        case "success":
          return {
            background: "var(--color-success-muted)",
            border: "1px solid color-mix(in srgb, var(--color-success) 30%, transparent)",
            color: "var(--color-success)",
          };
        case "warning":
          return {
            background: "var(--color-warning-muted)",
            border: "1px solid color-mix(in srgb, var(--color-warning) 30%, transparent)",
            color: "var(--color-warning)",
          };
        default:
          return {};
      }
    })();

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={{ borderRadius: "var(--radius-md)", ...variantStyles, ...style }}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
