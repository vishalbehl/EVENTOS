"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Columns3,
  GanttChart,
  LayoutList,
  Loader2,
  Minus,
  Plus,
  Redo2,
  Send,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSessionBuilderStore, type ViewMode } from "@/store/useSessionBuilderStore";
import { usePublishSchedule } from "@/hooks/useSessionBuilder";

interface BuilderToolbarProps {
  onNewSession?: () => void;
}

function dateOnly(value?: string | null) {
  return value?.split("T")[0]?.split(" ")[0] || null;
}

export function BuilderToolbar({ onNewSession }: BuilderToolbarProps = {}) {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const viewMode = useSessionBuilderStore((state) => state.viewMode);
  const setViewMode = useSessionBuilderStore((state) => state.setViewMode);
  const selectedDate = useSessionBuilderStore((state) => state.selectedDate);
  const setSelectedDate = useSessionBuilderStore((state) => state.setSelectedDate);
  const sessions = useSessionBuilderStore((state) => state.sessions);
  const rooms = useSessionBuilderStore((state) => state.rooms);
  const eventTimezone = useSessionBuilderStore((state) => state.eventTimezone);
  const eventStartDate = useSessionBuilderStore((state) => state.eventStartDate);
  const eventEndDate = useSessionBuilderStore((state) => state.eventEndDate);
  const conflicts = useSessionBuilderStore((state) => state.conflicts);
  const toggleConflictPanel = useSessionBuilderStore((state) => state.toggleConflictPanel);
  const isDirty = useSessionBuilderStore((state) => state.isDirty);
  const isSaving = useSessionBuilderStore((state) => state.isSaving);
  const history = useSessionBuilderStore((state) => state.history);
  const future = useSessionBuilderStore((state) => state.future);
  const undo = useSessionBuilderStore((state) => state.undo);
  const redo = useSessionBuilderStore((state) => state.redo);
  const zoomLevel = useSessionBuilderStore((state) => state.zoomLevel);
  const setZoomLevel = useSessionBuilderStore((state) => state.setZoomLevel);
  const publishMutation = usePublishSchedule(eventIdStr);

  const availableDates = useMemo(() => {
    const sessionCounts = new Map<string, number>();
    sessions.forEach((session) => {
      const day = dateOnly(session.start_time);
      if (day) sessionCounts.set(day, (sessionCounts.get(day) || 0) + 1);
    });

    const start = dateOnly(eventStartDate);
    const end = dateOnly(eventEndDate);
    const dates = new Set(sessionCounts.keys());
    if (start) {
      const startDate = parseISO(start);
      const numberOfDays = end
        ? Math.min(31, Math.max(0, differenceInCalendarDays(parseISO(end), startDate)))
        : 0;
      for (let index = 0; index <= numberOfDays; index += 1) {
        dates.add(format(addDays(startDate, index), "yyyy-MM-dd"));
      }
    }

    return Array.from(dates)
      .sort()
      .map((date, index) => ({
        date,
        day: index + 1,
        count: sessionCounts.get(date) || 0,
        label: format(parseISO(date), "EEE, d MMM"),
      }));
  }, [eventEndDate, eventStartDate, sessions]);

  const selectedDayIndex = Math.max(0, availableDates.findIndex((item) => item.date === selectedDate));
  const scheduledCount = sessions.filter((session) => session.room_id).length;
  const draftCount = sessions.filter((session) => !session.is_published).length;
  const blockingConflicts = conflicts.filter((conflict) => conflict.severity === "error").length;

  const moveDay = (offset: number) => {
    const target = availableDates[selectedDayIndex + offset];
    if (target) setSelectedDate(target.date);
  };

  const handlePublish = () => {
    if (blockingConflicts > 0) {
      const proceed = window.confirm(
        `${blockingConflicts} blocking schedule conflict${blockingConflicts === 1 ? "" : "s"} remain. Publish anyway?`,
      );
      if (!proceed) return;
    }
    publishMutation.mutate(undefined);
  };

  const views: Array<{ mode: ViewMode; label: string; icon: typeof GanttChart }> = [
    { mode: "timeline", label: "Schedule", icon: GanttChart },
    { mode: "kanban", label: "Rooms", icon: Columns3 },
    { mode: "list", label: "List", icon: LayoutList },
    { mode: "calendar", label: "Calendar", icon: CalendarDays },
  ];

  return (
    <header className="relative z-40 border-b border-[var(--border-default)] bg-[var(--card)] shadow-[0_1px_0_rgba(15,23,42,0.04)]">
      <div className="flex min-h-[62px] items-center justify-between gap-4 px-4 py-2.5 sm:px-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 shadow-[0_0_0_4px_rgba(16,185,129,0.12)]" />
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Programme control</p>
          </div>
          <div className="mt-1 flex items-baseline gap-3">
            <h1 className="truncate text-lg font-bold tracking-[-0.025em] text-[var(--text-primary)]">Schedule builder</h1>
            <p className="hidden text-xs text-[var(--text-secondary)] xl:block">
              {scheduledCount} placed · {sessions.length - scheduledCount} waiting · {rooms.length} rooms
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden items-center gap-1 border-r border-[var(--border-subtle)] pr-2 lg:flex">
            <Button variant="ghost" size="icon" onClick={undo} disabled={history.length === 0} className="size-8" title="Undo last schedule change">
              <Undo2 className="size-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={redo} disabled={future.length === 0} className="size-8" title="Redo schedule change">
              <Redo2 className="size-3.5" />
            </Button>
          </div>

          <button
            type="button"
            onClick={toggleConflictPanel}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pri)]",
              conflicts.length
                ? "border-rose-500/30 bg-rose-500/8 text-rose-600 hover:bg-rose-500/12 dark:text-rose-400"
                : "border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <AlertTriangle className="size-3.5" />
            <span>{conflicts.length ? `${conflicts.length} ${conflicts.length === 1 ? "check" : "checks"}` : "No conflicts"}</span>
          </button>

          <div className="hidden min-w-[92px] items-center justify-center text-[11px] font-semibold text-[var(--text-secondary)] sm:flex">
            {isSaving ? (
              <span className="inline-flex items-center gap-1.5 text-[var(--pri)]"><Loader2 className="size-3 animate-spin" /> Saving</span>
            ) : isDirty ? (
              <span className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"><span className="size-1.5 rounded-full bg-current" /> Queued</span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="size-3.5" /> Saved</span>
            )}
          </div>

          <Button onClick={onNewSession} variant="outline" className="hidden h-9 gap-2 px-3 text-xs font-semibold md:inline-flex">
            <Plus className="size-3.5" /> New session
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishMutation.isPending || sessions.length === 0}
            className="h-9 gap-2 bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm hover:opacity-90"
          >
            {publishMutation.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            Publish
            {draftCount > 0 ? <span className="rounded bg-black/15 px-1.5 py-0.5 text-[10px]">{draftCount}</span> : null}
          </Button>
        </div>
      </div>

      <div className="flex min-h-[48px] items-center justify-between gap-4 border-t border-[var(--border-subtle)] px-4 sm:px-5">
        <nav className="flex h-12 items-center gap-1" aria-label="Builder views">
          {views.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={cn(
                "relative inline-flex h-full items-center gap-2 px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pri)]",
                viewMode === mode ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <Icon className="size-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {viewMode === mode ? <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--pri)]" /> : null}
            </button>
          ))}
        </nav>

        <div className="flex min-w-0 items-center gap-2">
          {viewMode === "timeline" ? (
            <div className="hidden items-center rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] p-0.5 lg:flex">
              <button type="button" onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))} className="flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)]" aria-label="Zoom out">
                <Minus className="size-3" />
              </button>
              <span className="w-12 text-center text-[10px] font-bold tabular-nums text-[var(--text-secondary)]">{Math.round(zoomLevel * 100)}%</span>
              <button type="button" onClick={() => setZoomLevel(Math.min(2, zoomLevel + 0.25))} className="flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--card)] hover:text-[var(--text-primary)]" aria-label="Zoom in">
                <Plus className="size-3" />
              </button>
            </div>
          ) : null}

          {availableDates.length > 0 ? (
            <div className="flex min-w-0 items-center gap-1">
              <button type="button" onClick={() => moveDay(-1)} disabled={selectedDayIndex <= 0} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30" aria-label="Previous event day">
                <ChevronLeft className="size-4" />
              </button>
              <div className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
                {availableDates.map((item) => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => setSelectedDate(item.date)}
                    className={cn(
                      "h-8 shrink-0 rounded-lg px-3 text-left text-[11px] font-semibold transition-colors",
                      selectedDate === item.date
                        ? "bg-[var(--text-primary)] text-[var(--card)] shadow-sm"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]",
                    )}
                    title={`${item.count} scheduled session${item.count === 1 ? "" : "s"}`}
                  >
                    <span className="mr-1.5 opacity-65">D{item.day}</span>{item.label}
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => moveDay(1)} disabled={selectedDayIndex >= availableDates.length - 1} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] disabled:opacity-30" aria-label="Next event day">
                <ChevronRight className="size-4" />
              </button>
            </div>
          ) : (
            <span className="text-xs font-medium text-[var(--text-tertiary)]">Dates come from event details</span>
          )}

          <span className="hidden max-w-[150px] truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)] xl:block" title={eventTimezone}>
            {eventTimezone}
          </span>
        </div>
      </div>
    </header>
  );
}
