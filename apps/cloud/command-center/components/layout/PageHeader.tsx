import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  id?: string;
  title: string;
  description?: string;
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  id,
  title,
  description,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("mb-8 flex flex-col items-start justify-between gap-4 border-b border-[var(--border-subtle)] pb-6 md:flex-row", className)}>
      <div className="min-w-0">
        <h1 id={id} className="text-2xl font-semibold leading-tight tracking-[-0.03em] text-[var(--text)] md:text-3xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
            {description}
          </p>
        )}
      </div>
      <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0 md:justify-end">
        {children}
      </div>
    </header>
  );
}
