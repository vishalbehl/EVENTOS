"use client";

import React from "react";
import { Inbox, type LucideIcon } from "lucide-react";
import { AsyncState } from "./AsyncState";

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  title,
  description,
  icon = Inbox,
  action,
  className,
}: EmptyStateProps) {
  return (
    <AsyncState
      title={title}
      description={description}
      icon={icon}
      tone="neutral"
      action={action}
      className={className}
    />
  );
}
