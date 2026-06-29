"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  color?: "primary" | "success" | "warning" | "danger" | "cyan";
  size?: "xs" | "sm" | "md" | "lg";
  showLabel?: boolean;
  animated?: boolean;
}

const sizeMap = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
};

const colorMap: Record<string, { bar: string; glow: string }> = {
  primary: {
    bar: "linear-gradient(90deg, var(--color-primary-start), var(--color-primary-end))",
    glow: "0 0 10px var(--color-primary-glow)",
  },
  success: {
    bar: "linear-gradient(90deg, var(--color-accent-green), color-mix(in srgb, var(--color-accent-green) 80%, var(--color-accent-cyan)))",
    glow: "0 0 10px rgba(52, 211, 153, 0.35)",
  },
  warning: {
    bar: "linear-gradient(90deg, var(--color-accent-amber), color-mix(in srgb, var(--color-accent-amber) 80%, var(--color-accent-pink)))",
    glow: "0 0 10px rgba(251, 191, 36, 0.35)",
  },
  danger: {
    bar: "linear-gradient(90deg, var(--color-danger), color-mix(in srgb, var(--color-danger) 70%, var(--color-accent-pink)))",
    glow: "0 0 10px rgba(248, 113, 113, 0.35)",
  },
  cyan: {
    bar: "linear-gradient(90deg, var(--color-accent-cyan), var(--color-accent-green))",
    glow: "0 0 10px rgba(34, 211, 238, 0.35)",
  },
};

export function Progress({
  value = 0,
  color = "primary",
  size = "md",
  showLabel = false,
  animated = false,
  className,
  ...props
}: ProgressProps) {
  const clampedValue = Math.min(100, Math.max(0, value));
  const { bar, glow } = colorMap[color] || colorMap.primary;

  return (
    <div className={cn("w-full", showLabel && "space-y-1.5", className)}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest"
            style={{ color: "var(--color-text-muted)" }}>
            Progress
          </span>
          <span className="text-[12px] font-bold tabular-nums"
            style={{ color: "var(--color-text-primary)" }}>
            {clampedValue}%
          </span>
        </div>
      )}
      <div
        className={cn(
          "relative w-full overflow-hidden",
          sizeMap[size],
        )}
        style={{
          background: "var(--color-surface-4)",
          borderRadius: "var(--radius-full)",
          border: "1px solid var(--color-border)",
        }}
        role="progressbar"
        aria-valuenow={clampedValue}
        aria-valuemin={0}
        aria-valuemax={100}
        {...props}
      >
        <div
          className={cn(
            "h-full transition-all duration-700 ease-out",
            animated && "animate-shimmer bg-[length:200%_100%]",
          )}
          style={{
            width: `${clampedValue}%`,
            background: bar,
            boxShadow: glow,
            borderRadius: "var(--radius-full)",
          }}
        />
      </div>
    </div>
  );
}
