"use client";

import React from "react";

export default function TechnologyServicesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full bg-gradient-to-br from-zinc-950 via-zinc-900 to-black text-zinc-100 overflow-hidden">
      {children}
    </div>
  );
}
