"use client";

import { useState, useEffect } from "react";
import {
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  Download,
  ArrowLeft,
  Building2,
  Users,
  Clock,
  ArrowRight,
  ShieldAlert,
  SlidersHorizontal,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface ConflictItem {
  id: string;
  type: "room" | "speaker" | "moderator" | "resource" | "warning";
  severity: "high" | "medium" | "low";
  title: string;
  description: string;
  conflictTime: string;
  sessionA: {
    id: string;
    title: string;
    time: string;
    room: string;
  };
  sessionB: {
    id: string;
    title: string;
    time: string;
    room: string;
  };
}

interface ConflictsValidationHubProps {
  conflicts?: ConflictItem[];
  onResolveConflict: (conflictId: string) => void;
  onRecheck: () => void;
  onBack: () => void;
}

export function ConflictsValidationHub({
  conflicts = [],
  onResolveConflict,
  onRecheck,
  onBack,
}: ConflictsValidationHubProps) {
  const [filterType, setFilterType] = useState<string>("all");
  const [conflictList, setConflictList] = useState<ConflictItem[]>(conflicts);

  useEffect(() => {
    setConflictList(conflicts);
  }, [conflicts]);

  const filtered = conflictList.filter((c) => {
    if (filterType === "all") return true;
    return c.type === filterType;
  });

  const highCount = conflictList.filter((c) => c.severity === "high").length;
  const medCount = conflictList.filter((c) => c.severity === "medium").length;
  const lowCount = conflictList.filter((c) => c.severity === "low").length;

  const handleResolve = (id: string) => {
    setConflictList((prev) => prev.filter((c) => c.id !== id));
    onResolveConflict(id);
    toast.success("Conflict resolved: Session schedule shifted.");
  };

  const handleRecheckClick = () => {
    onRecheck();
    toast.info("Validation engine re-analyzed all sessions and speaker schedules.");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">
              Agenda Conflicts & Validation
            </h1>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Review and resolve room overlaps, speaker double-bookings, and timing anomalies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleRecheckClick}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--pri)] px-4 py-2 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-95 transition-opacity cursor-pointer"
          >
            <RotateCcw className="size-3.5" /> Recheck Conflicts
          </button>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          { key: "all", label: `All Issues (${conflictList.length})` },
          {
            key: "room",
            label: `Room Conflicts (${conflictList.filter((c) => c.type === "room").length})`,
          },
          {
            key: "speaker",
            label: `Speaker Conflicts (${conflictList.filter((c) => c.type === "speaker").length})`,
          },
          {
            key: "moderator",
            label: `Moderator Conflicts (${conflictList.filter((c) => c.type === "moderator").length})`,
          },
          {
            key: "resource",
            label: `Resource Conflicts (${conflictList.filter((c) => c.type === "resource").length})`,
          },
        ].map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilterType(f.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer",
              filterType === f.key
                ? "bg-[var(--pri)] text-[var(--primary-contrast)] shadow-xs font-bold"
                : "border border-[var(--border-default)] bg-[var(--card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Main Split Layout: Left Conflict Cards | Right Summary Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Conflict Cards (8 cols) */}
        <div className="lg:col-span-8 space-y-3.5">
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-8 text-center space-y-2">
              <CheckCircle2 className="size-10 text-emerald-500 mx-auto" />
              <h3 className="text-sm font-bold text-[var(--text-primary)]">
                No Schedule Conflicts Detected!
              </h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-sm mx-auto">
                All rooms, speakers, moderators, and breaks are cleanly allocated without overlaps.
              </p>
            </div>
          ) : (
            filtered.map((conflict) => (
              <div
                key={conflict.id}
                className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-4 shadow-xs space-y-3"
              >
                {/* Conflict Card Top Bar */}
                <div className="flex items-center justify-between border-b border-[var(--border-subtle)] pb-2.5">
                  <div className="flex items-center gap-2">
                    <div
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md font-bold",
                        conflict.severity === "high"
                          ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                          : conflict.severity === "medium"
                          ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                          : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      )}
                    >
                      <AlertTriangle className="size-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-[var(--text-primary)]">
                        {conflict.title}
                      </h4>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        {conflict.description}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "rounded px-2 py-0.5 text-[10px] font-bold uppercase",
                        conflict.severity === "high"
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                          : conflict.severity === "medium"
                          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                          : "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                      )}
                    >
                      {conflict.severity}
                    </span>
                    <div className="text-right">
                      <span className="text-[9px] uppercase tracking-wider text-[var(--text-tertiary)] block">
                        Conflict Time
                      </span>
                      <span className="font-mono text-xs font-bold text-rose-500">
                        {conflict.conflictTime}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Conflict Side-by-Side Comparison */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[var(--surface-subtle)] p-3 rounded-lg text-xs">
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Session A
                    </span>
                    <h5 className="font-bold text-[var(--text-primary)] line-clamp-1">
                      {conflict.sessionA.title}
                    </h5>
                    <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                      {conflict.sessionA.time}
                    </p>
                    <span className="text-[10px] text-[var(--pri)] block">
                      📍 {conflict.sessionA.room}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Session B
                    </span>
                    <h5 className="font-bold text-[var(--text-primary)] line-clamp-1">
                      {conflict.sessionB.title}
                    </h5>
                    <p className="text-[11px] text-[var(--text-secondary)] font-mono">
                      {conflict.sessionB.time}
                    </p>
                    <span className="text-[10px] text-[var(--pri)] block">
                      📍 {conflict.sessionB.room}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleResolve(conflict.id)}
                    className="flex items-center gap-1 rounded-md bg-[var(--pri)] px-3.5 py-1.5 text-xs font-bold text-[var(--primary-contrast)] shadow-xs hover:opacity-95 cursor-pointer"
                  >
                    Resolve Conflict <ArrowRight className="size-3" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Right Summary Widget (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Summary Card */}
          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] border-b border-[var(--border-subtle)] pb-2">
              Conflict Summary
            </h3>

            <div className="flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-3xl font-bold text-[var(--text-primary)]">
                  {conflictList.length}
                </span>
                <span className="text-xs text-[var(--text-secondary)]">Total Issues</span>
              </div>

              <div className="space-y-1 text-xs text-right">
                <div className="flex items-center justify-end gap-2">
                  <span className="size-2 rounded-full bg-rose-500" />
                  <span className="text-[var(--text-secondary)]">High:</span>
                  <span className="font-bold text-rose-500">{highCount}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="size-2 rounded-full bg-amber-500" />
                  <span className="text-[var(--text-secondary)]">Medium:</span>
                  <span className="font-bold text-amber-500">{medCount}</span>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <span className="size-2 rounded-full bg-blue-500" />
                  <span className="text-[var(--text-secondary)]">Low:</span>
                  <span className="font-bold text-blue-500">{lowCount}</span>
                </div>
              </div>
            </div>

            {/* Validation Checklist */}
            <div className="space-y-2 pt-2 border-t border-[var(--border-subtle)]">
              <h4 className="text-xs font-bold text-[var(--text-primary)]">
                Validation Checklist
              </h4>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Days Configured</span>
                  <span className="font-mono font-bold text-emerald-500">3/3</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Rooms Configured</span>
                  <span className="font-mono font-bold text-emerald-500">7/7</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Sessions Scheduled</span>
                  <span className="font-mono font-bold text-emerald-500">42/42</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Speakers Assigned</span>
                  <span className="font-mono font-bold text-emerald-500">38/38</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Documents Attached</span>
                  <span className="font-mono font-bold text-amber-500">24/42</span>
                </div>
                <div className="flex items-center justify-between text-[var(--text-secondary)]">
                  <span>Venue Ops Configured</span>
                  <span className="font-mono font-bold text-emerald-500">31/42</span>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => toast.success("Exporting conflict audit report PDF...")}
              className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] py-2 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)] cursor-pointer"
            >
              <Download className="size-3.5" /> Export Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
