"use client";

import React, { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface ChartCardProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  height?: string | number;
  children: ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  description,
  actions,
  height = 280,
  children,
  className,
}: ChartCardProps) {
  return (
    <div className={cn("bg-surface border border-border rounded-xl p-5 flex flex-col justify-between shadow-sm", className)}>
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="space-y-0.5 min-w-0">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">{title}</h3>
          {description && <p className="text-xs text-[var(--text-tertiary)] truncate">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </div>
      <div style={{ height }} className="w-full relative min-h-0 flex-1">
        {children}
      </div>
    </div>
  );
}
