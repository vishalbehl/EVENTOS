"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface MetricItem {
  label: string;
  value: string | number;
  delta?: string | number;
  icon?: React.ComponentType<{ className?: string }>;
}

interface MetricRowProps {
  metrics: MetricItem[];
  className?: string;
}

export function MetricRow({ metrics, className }: MetricRowProps) {
  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-stretch gap-4 sm:gap-0 rounded-xl border border-border bg-surface p-4 w-full sm:divide-x divide-border/60 shadow-sm",
        className
      )}
    >
      {metrics.map((m, idx) => (
        <div
          key={idx}
          className={cn(
            "flex items-center gap-3.5 flex-1 min-w-[140px]",
            idx > 0 ? "pt-4 sm:pt-0 sm:pl-6" : ""
          )}
        >
          {m.icon && (
            <div className="p-2 rounded-lg bg-surface-2 text-[var(--text-secondary)] flex-shrink-0">
              <m.icon className="w-4.5 h-4.5" />
            </div>
          )}
          <div className="space-y-0.5 truncate">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] truncate">
              {m.label}
            </p>
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                {m.value}
              </span>
              {m.delta !== undefined && (
                <span className="text-[10px] font-semibold text-[var(--success)] whitespace-nowrap">
                  {m.delta}
                </span>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
