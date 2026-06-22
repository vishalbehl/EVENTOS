"use client";

import React from "react";

export default function TechnologyServicesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
      {children}
    </div>
  );
}
