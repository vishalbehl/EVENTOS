"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-testid="skeleton"
      className={cn("animate-pulse rounded-lg bg-surface-2 border border-border/10", className)}
      {...props}
    />
  );
}

export function CardSkeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      data-testid="card-skeleton"
      className={cn(
        "bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl p-6 space-y-4",
        className
      )}
      {...props}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-8 rounded-full" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-3 w-48" />
      </div>
    </div>
  );
}

interface TableSkeletonProps extends SkeletonProps {
  rows?: number;
  cols?: number;
}

export function TableSkeleton({ rows = 5, cols = 4, className, ...props }: TableSkeletonProps) {
  return (
    <div
      data-testid="table-skeleton"
      className={cn(
        "bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-3xl overflow-hidden",
        className
      )}
      {...props}
    >
      {/* Table Header Skeleton */}
      <div className="bg-surface-2 border-b border-border/40 p-4 flex gap-4">
        {Array.from({ length: cols }).map((_, colIdx) => (
          <Skeleton key={`h-${colIdx}`} className="h-4 flex-1" />
        ))}
      </div>

      {/* Table Rows Skeleton */}
      <div className="p-4 space-y-4">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`r-${rowIdx}`} className="flex gap-4 items-center">
            {Array.from({ length: cols }).map((_, colIdx) => (
              <Skeleton key={`r-${rowIdx}-c-${colIdx}`} className="h-5 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
