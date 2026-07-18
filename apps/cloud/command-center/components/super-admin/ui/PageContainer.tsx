"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <section className={cn("mx-auto flex min-h-full w-full max-w-[1600px] shrink-0 flex-col space-y-6 px-[var(--space-page-x)] py-[var(--space-page-y)]", className)} {...props}>
      {children}
    </section>
  );
}
