"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number | null;
  deltaLabel?: string;
  trend?: number[];
  icon: LucideIcon;
  iconColor?: "success" | "warning" | "danger" | "info" | "brand";
  className?: string;
  destination?: string;
  size?: "compact" | "default" | "wide";
  trendLabel?: string;
}

const COLOR_MAPS = {
  success: {
    hex: "var(--chart-2)",
    bg: "bg-[var(--success-muted)] text-[var(--success)]",
  },
  warning: {
    hex: "var(--chart-3)",
    bg: "bg-[var(--warning-muted)] text-[var(--warning)]",
  },
  danger: {
    hex: "var(--chart-5)",
    bg: "bg-[var(--danger-muted)] text-[var(--danger)]",
  },
  info: {
    hex: "var(--chart-1)",
    bg: "bg-[var(--info-muted)] text-[var(--info)]",
  },
  brand: {
    hex: "var(--chart-4)",
    bg: "bg-[var(--brand-primary-muted)] text-[var(--brand-primary)]",
  },
};

export function KpiCard({
  title,
  value,
  delta,
  deltaLabel = "vs last month",
  trend = [],
  icon: Icon,
  iconColor = "brand",
  className,
  destination,
  size = "default",
  trendLabel,
}: KpiCardProps) {
  const colors = COLOR_MAPS[iconColor] || COLOR_MAPS.brand;
  const normalizedDelta = typeof delta === "number" && Number.isFinite(delta) ? delta : null;
  const hasDelta = normalizedDelta !== null;
  const deltaState = !hasDelta ? "missing" : normalizedDelta > 0 ? "positive" : normalizedDelta < 0 ? "negative" : "neutral";

  // Format trend data for Recharts
  const chartData = trend.map((v, i) => ({ index: i, value: v }));
  const gradientId = `kpi-grad-${title.replace(/\s+/g, "-").toLowerCase()}`;

  const content = (
    <article aria-label={`${title}: ${value}`} className={cn("group flex h-full flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-panel)] transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[var(--border-default)] hover:shadow-[var(--shadow-card-hover)]", size === "compact" ? "min-h-32 p-3" : "min-h-40 p-4", size === "wide" && "min-h-44", destination && "cursor-pointer focus-within:ring-2 focus-within:ring-[var(--focus-ring)]", className)}>
      <div className="flex items-center gap-2.5">
            <div className={cn("grid size-7 shrink-0 place-items-center rounded-lg border border-white/70 bg-[var(--bg-surface)] shadow-sm dark:border-white/10", colors.bg)}>
              <Icon className="size-3.5" />
            </div>
            <span className="min-w-0 truncate text-xs font-medium text-[var(--text-secondary)]">{title}</span>
      </div>
      <div className="flex flex-1 items-center py-3">
        <span className="break-words font-mono text-3xl font-semibold tabular-nums tracking-[-0.045em] text-[var(--text-primary)]">{value}</span>
      </div>
      <div className="flex min-h-8 items-end justify-between gap-3 border-t border-[var(--border-subtle)] pt-2.5">
        <div className="min-w-0">
          {hasDelta ? (
            <span
              className={cn(
                "inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums",
                deltaState === "positive" && "bg-[var(--success-muted)] text-[var(--success)]",
                deltaState === "negative" && "bg-[var(--danger-muted)] text-[var(--danger)]",
                deltaState === "neutral" && "bg-[var(--bg-surface-3)] text-[var(--text-tertiary)]"
              )}
            >
              <span className="sr-only">{deltaState === "positive" ? "Increase" : deltaState === "negative" ? "Decrease" : "No change"} </span>
              {normalizedDelta > 0 ? `+${normalizedDelta.toFixed(1)}%` : `${normalizedDelta.toFixed(1)}%`}
            </span>
          ) : <span className="text-[11px] font-medium text-[var(--text-tertiary)]">No comparison</span>}
          {deltaLabel && <span className="ml-1.5 text-[10px] text-[var(--text-tertiary)]">{deltaLabel}</span>}
        </div>
        {chartData.length > 0 && (
          <div className="h-8 w-24 shrink-0 opacity-70 transition-opacity duration-200 group-hover:opacity-100" role="img" aria-label={trendLabel || `${title} trend`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={colors.hex} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={colors.hex} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={colors.hex}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </article>
  );
  return destination ? <Link href={destination} className="block h-full rounded-[var(--radius-card)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]">{content}</Link> : content;
}
