"use client";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  src?: string | null;
  logoUrl?: string | null;
  name?: string;
  eventName?: string;
  shortCode?: string | null;
  subtitle?: string;
  size?: "sm" | "md" | "lg";
  compact?: boolean;
  onlyMark?: boolean;
  className?: string;
  markClassName?: string;
  textClassName?: string;
};

export function BrandLogo({
  src,
  logoUrl,
  name,
  eventName,
  shortCode,
  subtitle,
  size,
  compact = false,
  onlyMark = false,
  className,
  markClassName,
  textClassName,
}: BrandLogoProps) {
  const finalSrc = src || logoUrl;
  const finalShortCode = (shortCode || eventName?.slice(0, 3) || "EV").trim().toUpperCase();
  const finalName = name || eventName || "";
  const isCompact = compact || size === "sm";

  const markElement = finalSrc ? (
    <img
      src={finalSrc}
      alt={`${finalName || "Event"} logo`}
      className={cn(
        "h-10 w-10 shrink-0 rounded-full object-contain bg-[var(--bg-surface-2)] border border-[var(--border-default)]",
        isCompact && "h-8 w-8",
        markClassName
      )}
    />
  ) : (
    <div
      className={cn(
        "h-10 w-10 shrink-0 rounded-full bg-[var(--pri)] text-white font-black text-[11px] tracking-tight uppercase flex items-center justify-center shadow-md select-none border-2 border-white/20",
        isCompact && "h-8 w-8 text-[9px]",
        markClassName
      )}
    >
      {finalShortCode.slice(0, 4)}
    </div>
  );

  if (onlyMark) {
    return markElement;
  }

  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {markElement}
      {finalName ? (
        <span className="min-w-0">
          <span className={cn("block truncate text-base font-black leading-none tracking-tight text-[var(--text)]", isCompact && "text-sm", textClassName)}>
            {finalName}
          </span>
          {subtitle ? (
            <span className="mt-1 block truncate text-[10px] font-semibold leading-none text-[var(--muted)]">
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </div>
  );
}
