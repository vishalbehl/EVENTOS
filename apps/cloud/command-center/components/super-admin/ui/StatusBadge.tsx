"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type SuperAdminStatus =
  | "active"
  | "trial"
  | "grace"
  | "suspended"
  | "expired"
  | "cancelled"
  | "healthy"
  | "degraded"
  | "down"
  | "running"
  | "pending"
  | "failed"
  | "completed"
  | "paid"
  | "overdue"
  | "draft"
  | "info"
  | "warning"
  | "danger";

interface StatusBadgeProps {
  status: SuperAdminStatus | string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const norm = status.toLowerCase() as SuperAdminStatus;

  let bgClass = "bg-surface-2 text-[var(--text-tertiary)]";
  let dotColor = "bg-[var(--text-tertiary)]";
  let label = status;

  if (["active", "healthy", "paid", "completed"].includes(norm)) {
    bgClass = "bg-[var(--status-success-muted)] text-[var(--status-success)]";
    dotColor = "bg-[var(--status-success)]";
    label = norm === "paid" ? "Paid" : norm === "active" ? "Active" : norm === "healthy" ? "Healthy" : "Completed";
  } else if (["trial", "running", "pending", "info"].includes(norm)) {
    bgClass = "bg-[var(--status-info-muted)] text-[var(--status-info)]";
    dotColor = "bg-[var(--status-info)]";
    label = norm === "trial" ? "Trial" : norm === "running" ? "Running" : norm === "pending" ? "Pending" : "Info";
  } else if (["grace", "warning", "degraded"].includes(norm)) {
    bgClass = "bg-[var(--status-warning-muted)] text-[var(--status-warning)]";
    dotColor = "bg-[var(--status-warning)]";
    label = norm === "grace" ? "Grace Period" : norm === "warning" ? "Warning" : "Degraded";
  } else if (["suspended", "down", "overdue", "failed", "danger"].includes(norm)) {
    bgClass = "bg-[var(--status-danger-muted)] text-[var(--status-danger)]";
    dotColor = "bg-[var(--status-danger)]";
    label = norm === "suspended" ? "Suspended" : norm === "down" ? "Down" : norm === "overdue" ? "Overdue" : norm === "failed" ? "Failed" : "Danger";
  } else if (["expired", "cancelled", "draft"].includes(norm)) {
    bgClass = "bg-surface-2 text-[var(--text-tertiary)]";
    dotColor = "bg-[var(--text-tertiary)]";
    label = norm === "expired" ? "Expired" : norm === "cancelled" ? "Cancelled" : "Draft";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border border-border/10",
        bgClass,
        className
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dotColor)} />
      <span className="capitalize">{label}</span>
    </span>
  );
}
