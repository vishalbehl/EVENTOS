"use client";

import { type ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}

export function SectionHeader({ title, description, actions }: SectionHeaderProps) {
  return (
    <header className="flex flex-col justify-between gap-4 pb-2 md:flex-row md:items-end">
      <div className="min-w-0 space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.035em] text-[var(--text-primary)]">{title}</h1>
        {description ? <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto">{actions}</div> : null}
    </header>
  );
}
