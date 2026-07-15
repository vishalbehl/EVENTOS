"use client";

import React, { type ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}

export function SectionHeader({ title, description, actions, breadcrumb }: SectionHeaderProps) {
  return (
    <header className="flex flex-col justify-between gap-4 border-b border-border/40 pb-5 md:flex-row md:items-center">
      <div className="min-w-0 space-y-1.5">
        {breadcrumb?.length ? (
          <div aria-label="Section path" className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium tracking-wide">
            {breadcrumb.map((crumb, index) => {
              const isLast = index === breadcrumb.length - 1;
              return (
                <React.Fragment key={`${crumb}-${index}`}>
                  <span className={isLast ? "font-semibold text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]"}>{crumb}</span>
                  {!isLast ? <span aria-hidden className="text-[var(--text-tertiary)] opacity-60">/</span> : null}
                </React.Fragment>
              );
            })}
          </div>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
        {description ? <p className="max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex w-full flex-wrap items-center gap-2.5 md:w-auto">{actions}</div> : null}
    </header>
  );
}
