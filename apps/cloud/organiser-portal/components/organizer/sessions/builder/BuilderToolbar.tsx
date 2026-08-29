"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  LayoutGrid,
  LayoutList,
  GanttChart,
  CalendarDays,
  Undo2,
  Redo2,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Send,
  Calendar as CalendarIcon,
  Clock,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionBuilderStore, ViewMode } from "@/store/useSessionBuilderStore";
import { usePublishSchedule } from "@/hooks/useSessionBuilder";
import { Button } from "@/components/ui/button";

interface BuilderToolbarProps {
  onNewSession?: () => void;
}

export function BuilderToolbar({ onNewSession }: BuilderToolbarProps = {}) {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;

  const viewMode = useSessionBuilderStore((s) => s.viewMode);
  const setViewMode = useSessionBuilderStore((s) => s.setViewMode);

  const selectedDate = useSessionBuilderStore((s) => s.selectedDate);
  const setSelectedDate = useSessionBuilderStore((s) => s.setSelectedDate);

  const isDirty = useSessionBuilderStore((s) => s.isDirty);
  const isSaving = useSessionBuilderStore((s) => s.isSaving);

  const conflicts = useSessionBuilderStore((s) => s.conflicts);
  const toggleConflictPanel = useSessionBuilderStore((s) => s.toggleConflictPanel);

  const history = useSessionBuilderStore((s) => s.history);
  const future = useSessionBuilderStore((s) => s.future);
  const undo = useSessionBuilderStore((s) => s.undo);
  const redo = useSessionBuilderStore((s) => s.redo);
  const zoomLevel = useSessionBuilderStore((s) => s.zoomLevel);
  const setZoomLevel = useSessionBuilderStore((s) => s.setZoomLevel);

  const sessions = useSessionBuilderStore((s) => s.sessions);
  const publishMutation = usePublishSchedule(eventIdStr);

  // Custom Dropdown Open States
  const [dateDropdownOpen, setDateDropdownOpen] = useState(false);
  const [zoomDropdownOpen, setZoomDropdownOpen] = useState(false);
  const dateDropdownRef = useRef<HTMLDivElement>(null);
  const zoomDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dateDropdownRef.current && !dateDropdownRef.current.contains(event.target as Node)) {
        setDateDropdownOpen(false);
      }
      if (zoomDropdownRef.current && !zoomDropdownRef.current.contains(event.target as Node)) {
        setZoomDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Extract unique dates with metadata from sessions
  const availableDates = useMemo(() => {
    const map = new Map<string, number>();
    sessions.forEach((s) => {
      if (s.start_time) {
        const datePart = s.start_time.split("T")[0];
        map.set(datePart, (map.get(datePart) || 0) + 1);
      }
    });

    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([dateStr, count], index) => {
        let label = dateStr;
        try {
          const parsed = parseISO(dateStr);
          label = format(parsed, "EEE, dd MMM yyyy");
        } catch (e) {}
        return {
          dateStr,
          label,
          dayNumber: index + 1,
          count,
        };
      });
  }, [sessions]);

  // Count draft vs published sessions
  const draftCount = useMemo(() => {
    return sessions.filter((s) => !s.is_published).length;
  }, [sessions]);

  const selectedDateObj = availableDates.find((d) => d.dateStr === selectedDate);

  const handlePublish = () => {
    if (conflicts.length > 0) {
      const proceed = confirm(
        `There are ${conflicts.length} scheduling conflict(s) detected. Are you sure you want to publish the schedule to live attendees and venue screens?`
      );
      if (!proceed) return;
    }
    publishMutation.mutate(undefined);
  };

  const VIEW_MODES: { mode: ViewMode; icon: any; label: string }[] = [
    { mode: "kanban", icon: LayoutGrid, label: "Kanban" },
    { mode: "timeline", icon: GanttChart, label: "Timeline" },
    { mode: "list", icon: LayoutList, label: "List" },
    { mode: "calendar", icon: CalendarDays, label: "Calendar" },
  ];

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-4 py-2.5 border-b border-[var(--border-default)] bg-[var(--card)] sticky top-0 z-30 shadow-xs">
      {/* Left Group: View Mode Switcher + Themed Date Picker + Zoom Selector */}
      <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
        {/* View Switcher */}
        <div className="flex items-center bg-[var(--surface-subtle)] rounded-lg p-0.5 border border-[var(--border-default)]">
          {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all",
                viewMode === mode
                  ? "bg-[var(--pri)] text-black font-semibold shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--card)]"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Themed Date Picker Dropdown */}
        {availableDates.length > 0 && (
          <div className="relative" ref={dateDropdownRef}>
            <button
              type="button"
              onClick={() => setDateDropdownOpen(!dateDropdownOpen)}
              className={cn(
                "flex items-center gap-2 bg-[var(--surface-subtle)] hover:bg-[var(--surface-subtle)]/80 rounded-lg px-2.5 py-1 border transition-all text-xs font-medium",
                dateDropdownOpen
                  ? "border-[var(--pri)] ring-1 ring-[var(--pri)]/40 text-[var(--text-primary)]"
                  : "border-[var(--border-default)] text-[var(--text-primary)]"
              )}
            >
              <CalendarIcon className="h-3.5 w-3.5 text-[var(--pri)] flex-shrink-0" />
              <span className="font-semibold text-xs">
                {selectedDateObj ? `Day ${selectedDateObj.dayNumber} • ${selectedDateObj.label}` : "Select Date"}
              </span>
              <ChevronDown className={cn("h-3 w-3 text-[var(--text-secondary)] transition-transform", dateDropdownOpen && "rotate-180")} />
            </button>

            {dateDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-64 bg-[var(--card)] border border-[var(--border-default)] rounded-lg shadow-lg p-1.5 z-50 flex flex-col gap-1">
                <div className="px-2 py-1 text-[10px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider border-b border-[var(--border-subtle)]">
                  Event Schedule Days
                </div>
                {availableDates.map((item) => {
                  const isSelected = item.dateStr === selectedDate;
                  return (
                    <button
                      key={item.dateStr}
                      type="button"
                      onClick={() => {
                        setSelectedDate(item.dateStr);
                        setDateDropdownOpen(false);
                      }}
                      className={cn(
                        "flex items-center justify-between w-full px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors text-left",
                        isSelected
                          ? "bg-[var(--pri)]/10 text-[var(--pri)] font-semibold border border-[var(--pri)]/30"
                          : "text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "text-[10px] font-bold px-1.5 py-0.5 rounded",
                          isSelected ? "bg-[var(--pri)] text-black" : "bg-[var(--surface-subtle)] text-[var(--text-secondary)]"
                        )}>
                          Day {item.dayNumber}
                        </span>
                        <span className="truncate">{item.label}</span>
                      </div>
                      <span className="text-[10px] text-[var(--text-secondary)] font-normal ml-2">
                        {item.count} sessions
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Themed Time Scale Selector for Timeline */}
        {viewMode === "timeline" && (
          <div className="relative" ref={zoomDropdownRef}>
            <button
              type="button"
              onClick={() => setZoomDropdownOpen(!zoomDropdownOpen)}
              className={cn(
                "flex items-center gap-1.5 bg-[var(--surface-subtle)] hover:bg-[var(--surface-subtle)]/80 rounded-lg px-2.5 py-1 border transition-all text-xs font-medium",
                zoomDropdownOpen
                  ? "border-[var(--pri)] ring-1 ring-[var(--pri)]/40 text-[var(--text-primary)]"
                  : "border-[var(--border-default)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
            >
              <Clock className="h-3.5 w-3.5 text-[var(--pri)]" />
              <span>{zoomLevel >= 1.8 ? "15m Grid" : zoomLevel >= 0.9 ? "30m Grid" : "60m Grid"}</span>
              <ChevronDown className={cn("h-3 w-3 text-[var(--text-secondary)] transition-transform", zoomDropdownOpen && "rotate-180")} />
            </button>

            {zoomDropdownOpen && (
              <div className="absolute left-0 mt-1.5 w-36 bg-[var(--card)] border border-[var(--border-default)] rounded-lg shadow-lg p-1 z-50 flex flex-col gap-0.5">
                {[
                  { value: 2, label: "15 min zoom" },
                  { value: 1, label: "30 min zoom" },
                  { value: 0.5, label: "60 min zoom" },
                ].map((scale) => (
                  <button
                    key={scale.value}
                    type="button"
                    onClick={() => {
                      setZoomLevel(scale.value);
                      setZoomDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full text-left px-2.5 py-1.5 rounded-md text-xs transition-colors",
                      zoomLevel === scale.value
                        ? "bg-[var(--pri)]/10 text-[var(--pri)] font-semibold"
                        : "text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
                    )}
                  >
                    {scale.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Group: Undo/Redo + Conflicts + Draft Auto-Save Status + Publish Schedule */}
      <div className="flex items-center gap-2.5 w-full md:w-auto justify-end flex-wrap">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 border-r border-[var(--border-subtle)] pr-2.5">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={history.length === 0}
            className="h-7 w-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={future.length === 0}
            className="h-7 w-7 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-30"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Conflicts Badge */}
        <button
          onClick={toggleConflictPanel}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-all",
            conflicts.length > 0
              ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20"
              : "border-[var(--border-default)] bg-[var(--surface-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
          <span>{conflicts.length} Conflicts</span>
        </button>

        {/* Draft Auto-Save Status */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-secondary)] px-1">
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-[var(--pri)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Draft Saving
            </span>
          ) : isDirty ? (
            <span className="text-amber-400 font-medium flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Draft Staging
            </span>
          ) : (
            <span className="flex items-center gap-1 text-emerald-400">
              <CheckCircle2 className="h-3.5 w-3.5" /> Draft Saved
            </span>
          )}
        </div>

        {/* Publish Schedule CTA */}
        <Button
          disabled={publishMutation.isPending}
          onClick={handlePublish}
          className="h-8 px-3.5 bg-[var(--pri)] hover:bg-[var(--pri)]/90 text-black font-semibold text-xs tracking-wide rounded-md shadow-xs flex items-center gap-1.5 border-0"
          title="Publish and finalize sessions for attendee agenda, public website, and venue displays"
        >
          {publishMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
          <span>Publish Schedule</span>
          {draftCount > 0 && (
            <span className="ml-1 px-1.5 py-0.2 bg-black/20 text-black font-bold text-[10px] rounded-full">
              {draftCount}
            </span>
          )}
        </Button>
      </div>
    </div>
  );
}
