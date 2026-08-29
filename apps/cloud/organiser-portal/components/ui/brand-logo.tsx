"use client";

import { cn } from "@/lib/utils";

type BrandLogoProps = {
  src?: string | null;
  name?: string;
  subtitle?: string;
  compact?: boolean;
  className?: string;
  markClassName?: string;
  textClassName?: string;
};

export function BrandLogo({
  src,
  name = "eventos",
  subtitle,
  compact = false,
  className,
  markClassName,
  textClassName,
}: BrandLogoProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-3", className)}>
      {src ? (
        <img
          src={src}
          alt={`${name} logo`}
          className={cn("h-10 w-10 shrink-0 rounded-2xl object-contain", compact && "h-9 w-9", markClassName)}
        />
      ) : (
        <span
          className={cn(
            "grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[var(--color-primary-start)] via-[var(--color-primary-mid)] to-[var(--color-primary-end)] text-base font-black text-[var(--color-text-inverse)] shadow-glow-primary",
            compact && "h-9 w-9 text-sm",
            markClassName,
          )}
        >
          e
        </span>
      )}
      <span className="min-w-0">
        <span className={cn("block truncate text-lg font-black leading-none tracking-tight text-[var(--color-text-primary)]", compact && "text-base", textClassName)}>
          {name}
        </span>
        {subtitle ? (
          <span className="mt-1 block truncate text-[10px] font-semibold leading-none text-[var(--color-text-muted)]">
            {subtitle}
          </span>
        ) : null}
      </span>
    </div>
  );
}
