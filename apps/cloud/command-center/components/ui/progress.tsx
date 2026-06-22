"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
}

export function Progress({ value = 0, className, ...props }: ProgressProps) {
  return (
    <div
      className={cn(
        "relative h-4 w-full overflow-hidden rounded-full bg-zinc-800/50 border border-zinc-700/30",
        className
      )}
      {...props}
    >
      <div
        className="h-full w-full flex-1 bg-gradient-to-r from-[var(--pri)] to-[var(--sec)] transition-all duration-300 ease-out"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </div>
  );
}
