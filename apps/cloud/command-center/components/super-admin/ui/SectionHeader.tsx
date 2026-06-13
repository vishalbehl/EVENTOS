"use client";

import React, { ReactNode } from "react";

interface SectionHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: string[];
}

export function SectionHeader({ title, description, actions, breadcrumb }: SectionHeaderProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
      <div className="space-y-1.5">
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide">
            {breadcrumb.map((crumb, idx) => {
              const isLast = idx === breadcrumb.length - 1;
              return (
                <React.Fragment key={idx}>
                  <span className={isLast ? "text-[var(--text-secondary)] font-semibold" : "text-[var(--text-tertiary)]"}>
                    {crumb}
                  </span>
                  {!isLast && <span className="text-[var(--text-tertiary)] opacity-60">›</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{title}</h1>
        {description && <p className="text-sm text-[var(--text-secondary)]">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2.5 self-start md:self-center">{actions}</div>}
    </div>
  );
}
