"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronUp,
  ExternalLink,
  Flame,
  GripVertical,
  Info,
  RefreshCw,
  ShieldAlert,
  X,
} from "lucide-react";

import {
  useEventNeedsAttention,
  useOrganiserNeedsAttention,
} from "@/hooks/useOrganiserDashboard";
import type { AttentionItem } from "@/components/organizer/workspace/OrganiserPrimitives";
import { cn } from "@/lib/utils";

type SeverityFilter = "all" | "critical" | "warning" | "info";

export function FloatingNeedsAttentionBoard() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string | undefined;

  const orgAttention = useOrganiserNeedsAttention();
  const eventAttention = useEventNeedsAttention(eventId);

  const activeQuery = eventId ? eventAttention : orgAttention;
  const rawItems: AttentionItem[] = activeQuery.data || [];

  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<SeverityFilter>("all");
  const [isDragging, setIsDragging] = useState(false);

  const constraintsRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);

  // Close when pressing Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Aggregate items and counts
  const totalCount = useMemo(() => {
    return rawItems.reduce((acc, item) => acc + (item.count || 1), 0);
  }, [rawItems]);

  const criticalCount = useMemo(() => {
    return rawItems
      .filter((i) => i.severity === "critical" || i.severity === "danger")
      .reduce((acc, item) => acc + (item.count || 1), 0);
  }, [rawItems]);

  const warningCount = useMemo(() => {
    return rawItems
      .filter((i) => i.severity === "warning")
      .reduce((acc, item) => acc + (item.count || 1), 0);
  }, [rawItems]);

  const infoCount = useMemo(() => {
    return rawItems
      .filter((i) => !i.severity || i.severity === "info" || i.severity === "success")
      .reduce((acc, item) => acc + (item.count || 1), 0);
  }, [rawItems]);

  const filteredItems = useMemo(() => {
    if (filter === "all") return rawItems;
    if (filter === "critical") {
      return rawItems.filter(
        (i) => i.severity === "critical" || i.severity === "danger"
      );
    }
    if (filter === "warning") {
      return rawItems.filter((i) => i.severity === "warning");
    }
    return rawItems.filter(
      (i) => !i.severity || i.severity === "info" || i.severity === "success"
    );
  }, [rawItems, filter]);

  const hasRemaining = totalCount > 0;

  const handleItemClick = (href: string) => {
    setIsOpen(false);
    router.push(href);
  };

  const handleToggle = () => {
    if (isDragging) return;
    setIsOpen((prev) => !prev);
  };

  return (
    <>
      {/* 1. Full-Viewport Boundary Constraint Container for Draggable Floater */}
      <div
        ref={constraintsRef}
        className="fixed inset-4 pointer-events-none z-[90] overflow-hidden"
      >
        {/* 2. Draggable Floater Button (Stays permanently in dragged spot without shifting) */}
        <motion.div
          ref={pillRef}
          drag
          dragConstraints={constraintsRef}
          dragElastic={0}
          dragMomentum={false}
          onDragStart={() => setIsDragging(true)}
          onDragEnd={() => {
            setTimeout(() => setIsDragging(false), 120);
          }}
          className="pointer-events-auto absolute bottom-0 right-0 select-none print:hidden font-sans touch-none"
        >
          <motion.button
            type="button"
            onClick={handleToggle}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            aria-expanded={isOpen}
            aria-label={`Needs attention board, ${totalCount} items remaining. Drag anywhere on screen.`}
            title="Click to open Side Drawer, drag anywhere on screen"
            className={cn(
              "group relative flex items-center gap-2 rounded-full pl-3 pr-4 py-2.5 text-xs font-bold transition-all duration-200 shadow-md cursor-grab active:cursor-grabbing",
              hasRemaining
                ? "border border-amber-500/50 bg-amber-500 text-zinc-950 hover:border-amber-300 hover:bg-amber-400"
                : "border border-zinc-700/80 bg-zinc-900 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800"
            )}
          >
            <GripVertical
              className={cn(
                "size-3.5 shrink-0 opacity-40 group-hover:opacity-90 transition-opacity",
                hasRemaining ? "text-zinc-950" : "text-zinc-400"
              )}
            />

            <div className="relative flex items-center gap-2">
              <div
                className={cn(
                  "grid size-5 place-items-center rounded-full",
                  hasRemaining
                    ? "bg-zinc-950 text-amber-400"
                    : "bg-zinc-800 text-zinc-400"
                )}
              >
                {criticalCount > 0 ? (
                  <Flame className="size-3 text-rose-400 animate-pulse" />
                ) : (
                  <ShieldAlert className="size-3" />
                )}
              </div>

              <span className="tracking-wide font-bold">
                {isOpen ? "Attention Board" : "Needs Attention"}
              </span>

              {totalCount > 0 ? (
                <span
                  className={cn(
                    "flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-black tabular-nums",
                    hasRemaining
                      ? "bg-zinc-950 text-amber-300"
                      : "bg-zinc-800 text-zinc-300"
                  )}
                >
                  {totalCount}
                </span>
              ) : (
                <span className="flex size-2 rounded-full bg-emerald-400" />
              )}

              <div
                className={cn(
                  "transition-transform duration-200",
                  isOpen ? "rotate-180" : "rotate-0"
                )}
              >
                <ChevronUp className="size-3.5 opacity-80" />
              </div>
            </div>
          </motion.button>
        </motion.div>
      </div>

      {/* 3. Full-View Slide-Over Side Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Soft Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-[95] bg-black/60 cursor-pointer"
            />

            {/* Slide-Over Side Drawer Panel */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 26, stiffness: 240 }}
              className="fixed inset-y-0 right-0 z-[100] flex w-full max-w-lg flex-col bg-zinc-950 text-zinc-100 shadow-md border-l border-amber-500/30 font-sans select-none"
            >
              {/* Drawer Header */}
              <div className="relative shrink-0 overflow-hidden border-b border-amber-500/25 bg-zinc-900 p-5">
                <div className="relative flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-lg border border-amber-500/40 bg-amber-500/15 text-amber-300 shrink-0">
                      {criticalCount > 0 ? (
                        <Flame className="size-5 text-rose-400 animate-pulse" />
                      ) : (
                        <ShieldAlert className="size-5 text-amber-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-base font-bold tracking-tight text-white">
                          Needs Attention
                        </h2>
                        <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
                          {eventId ? "Event Scope" : "Platform Scope"}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-amber-200/70 mt-0.5">
                        {totalCount === 0
                          ? "Everything is operational & up to date"
                          : `${totalCount} item${totalCount === 1 ? "" : "s"} require organizer action`}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      title="Refresh status"
                      onClick={() => activeQuery.refetch()}
                      className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      <RefreshCw
                        className={cn(
                          "size-4",
                          activeQuery.isFetching && "animate-spin text-amber-400"
                        )}
                      />
                    </button>
                    <button
                      type="button"
                      title="Close drawer"
                      onClick={() => setIsOpen(false)}
                      className="grid size-8 place-items-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                {/* Filter Tabs */}
                {totalCount > 0 && (
                  <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-0.5 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => setFilter("all")}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                        filter === "all"
                          ? "border border-amber-500/50 bg-amber-500/20 text-amber-200 shadow-xs"
                          : "border border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                      )}
                    >
                      All
                      <span className="rounded-full bg-white/10 px-1.5 py-0.2 text-[10px] font-bold">
                        {totalCount}
                      </span>
                    </button>

                    {criticalCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter("critical")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                          filter === "critical"
                            ? "border border-rose-500/50 bg-rose-500/20 text-rose-200 shadow-xs"
                            : "border border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                        )}
                      >
                        <Flame className="size-3.5 text-rose-400" />
                        Critical
                        <span className="rounded-full bg-rose-500/30 px-1.5 py-0.2 text-[10px] font-bold text-rose-200">
                          {criticalCount}
                        </span>
                      </button>
                    )}

                    {warningCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter("warning")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                          filter === "warning"
                            ? "border border-amber-500/50 bg-amber-500/20 text-amber-200 shadow-xs"
                            : "border border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                        )}
                      >
                        <AlertTriangle className="size-3.5 text-amber-400" />
                        Warnings
                        <span className="rounded-full bg-amber-500/30 px-1.5 py-0.2 text-[10px] font-bold text-amber-200">
                          {warningCount}
                        </span>
                      </button>
                    )}

                    {infoCount > 0 && (
                      <button
                        type="button"
                        onClick={() => setFilter("info")}
                        className={cn(
                          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer",
                          filter === "info"
                            ? "border border-sky-500/50 bg-sky-500/20 text-sky-200 shadow-xs"
                            : "border border-white/5 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-zinc-200"
                        )}
                      >
                        <Info className="size-3.5 text-sky-400" />
                        Notices
                        <span className="rounded-full bg-sky-500/30 px-1.5 py-0.2 text-[10px] font-bold text-sky-200">
                          {infoCount}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Full-Height Scrollable Item List */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5 custom-scrollbar bg-zinc-950">
                {filteredItems.length > 0 ? (
                  filteredItems.map((item) => {
                    const isCritical =
                      item.severity === "critical" || item.severity === "danger";
                    const isWarning = item.severity === "warning";

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleItemClick(item.href)}
                        className={cn(
                          "group relative flex cursor-pointer items-start justify-between gap-3 rounded-lg border p-4 transition-all duration-150 shadow-xs",
                          isCritical
                            ? "border-rose-500/30 bg-rose-950/30 hover:border-rose-400/60 hover:bg-rose-950/50"
                            : isWarning
                              ? "border-amber-500/30 bg-amber-950/30 hover:border-amber-400/60 hover:bg-amber-950/50"
                              : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700 hover:bg-zinc-800/60"
                        )}
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={cn(
                              "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border",
                              isCritical
                                ? "border-rose-500/40 bg-rose-500/20 text-rose-300"
                                : isWarning
                                  ? "border-amber-500/40 bg-amber-500/20 text-amber-300"
                                  : "border-sky-500/40 bg-sky-500/20 text-sky-300"
                            )}
                          >
                            {isCritical ? (
                              <Flame className="size-4" />
                            ) : isWarning ? (
                              <AlertTriangle className="size-4" />
                            ) : (
                              <Info className="size-4" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <strong className="truncate text-xs font-semibold text-zinc-100 group-hover:text-white">
                                {item.title}
                              </strong>
                              {isCritical && (
                                <span className="shrink-0 rounded bg-rose-500/25 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-rose-300">
                                  High Priority
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-400">
                                {item.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-2.5 self-center">
                          {typeof item.count === "number" && item.count > 0 && (
                            <span
                              className={cn(
                                "rounded-full px-2.5 py-0.5 text-xs font-black tabular-nums",
                                isCritical
                                  ? "bg-rose-500 text-white"
                                  : isWarning
                                    ? "bg-amber-500 text-zinc-950 font-bold"
                                    : "bg-zinc-800 text-zinc-200"
                              )}
                            >
                              {item.count}
                            </span>
                          )}
                          <div className="grid size-7 place-items-center rounded-full bg-white/5 text-zinc-400 transition-transform duration-150 group-hover:translate-x-1 group-hover:bg-white/10 group-hover:text-white">
                            <ArrowRight className="size-4" />
                          </div>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="grid size-14 place-items-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                      <CheckCircle2 className="size-7" />
                    </div>
                    <h3 className="mt-4 text-sm font-bold text-zinc-200">
                      All clear & on schedule
                    </h3>
                    <p className="mt-1.5 max-w-[280px] text-xs text-zinc-400 leading-relaxed">
                      No pending items match this filter. Everything in your workspace is operating smoothly.
                    </p>
                  </div>
                )}
              </div>

              {/* Drawer Footer */}
              <div className="shrink-0 flex items-center justify-between border-t border-zinc-800/80 bg-zinc-900 px-5 py-3 text-xs">
                <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-400">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  Live Sync Active
                </span>

                <Link
                  href="/dashboard/needs-attention"
                  onClick={() => setIsOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 transition-colors hover:text-amber-300"
                >
                  Full Workspace Queue
                  <ExternalLink className="size-3.5" />
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
