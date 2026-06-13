"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function PageContainer({ children, className, ...props }: PageContainerProps) {
  return (
    <div className={cn("max-w-[1600px] mx-auto px-6 py-6 space-y-6 w-full flex flex-col min-h-0", className)} {...props}>
      {children}
    </div>
  );
}
