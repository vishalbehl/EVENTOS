"use client";

import React from "react";
import { LucideIcon } from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";

interface KpiCardProps {
  title: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  trend?: number[];
  icon: LucideIcon;
  iconColor?: "success" | "warning" | "danger" | "info" | "brand";
  className?: string;
}

const COLOR_MAPS = {
  success: {
    hex: "#10B981",
    bg: "bg-[var(--success-muted)] text-[var(--success)]",
  },
  warning: {
    hex: "#F59E0B",
    bg: "bg-[var(--warning-muted)] text-[var(--warning)]",
  },
  danger: {
    hex: "#EF4444",
    bg: "bg-[var(--danger-muted)] text-[var(--danger)]",
  },
  info: {
    hex: "#3B82F6",
    bg: "bg-[var(--info-muted)] text-[var(--info)]",
  },
  brand: {
    hex: "#7C3AED",
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
}: KpiCardProps) {
  const colors = COLOR_MAPS[iconColor] || COLOR_MAPS.brand;
  const isPositive = delta !== undefined && delta >= 0;

  // Format trend data for Recharts
  const chartData = trend.map((v, i) => ({ index: i, value: v }));
  const gradientId = `kpi-grad-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className={cn("relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-sm transition-all duration-200 hover:border-border/80 flex flex-col justify-between", className)}>
      <div>
        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0", colors.bg)}>
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{title}</span>
          </div>
        </div>

        {/* Middle */}
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{value}</span>
          {delta !== undefined && (
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide",
                isPositive
                  ? "bg-[var(--success-muted)] text-[var(--success)]"
                  : "bg-[var(--danger-muted)] text-[var(--danger)]"
              )}
            >
              {isPositive ? `↑ +${delta.toFixed(1)}%` : `↓ ${delta.toFixed(1)}%`}
            </span>
          )}
        </div>
      </div>

      {/* Bottom section with sparkline */}
      <div className="flex items-end justify-between mt-5 gap-4">
        <span className="text-[10px] text-[var(--text-tertiary)] font-medium leading-none">{deltaLabel}</span>
        {chartData.length > 0 && (
          <div className="h-10 w-24 flex-shrink-0 opacity-80 hover:opacity-100 transition-opacity duration-200">
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
    </div>
  );
}
