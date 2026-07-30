"use client";

import { useMemo } from "react";
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
  Plus,
  Search,
  Calendar as CalendarIcon,
  Clock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionBuilderStore, ViewMode } from "@/store/useSessionBuilderStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface BuilderToolbarProps {
  onNewSession?: () => void;
}

export function BuilderToolbar({ onNewSession }: BuilderToolbarProps) {
  const viewMode = useSessionBuilderStore((s) => s.viewMode);
  const setViewMode = useSessionBuilderStore((s) => s.setViewMode);

  const selectedDate = useSessionBuilderStore((s) => s.selectedDate);
  const setSelectedDate = useSessionBuilderStore((s) => s.setSelectedDate);

  const searchQuery = useSessionBuilderStore((s) => s.searchQuery);
  const setSearchQuery = useSessionBuilderStore((s) => s.setSearchQuery);

  const isDirty = useSessionBuilderStore((s) => s.isDirty);
  const isSaving = useSessionBuilderStore((s) => s.isSaving);
  const lastSavedAt = useSessionBuilderStore((s) => s.lastSavedAt);

  const conflicts = useSessionBuilderStore((s) => s.conflicts);
  const toggleConflictPanel = useSessionBuilderStore((s) => s.toggleConflictPanel);

  const history = useSessionBuilderStore((s) => s.history);
  const future = useSessionBuilderStore((s) => s.future);
  const undo = useSessionBuilderStore((s) => s.undo);
  const redo = useSessionBuilderStore((s) => s.redo);
  const zoomLevel = useSessionBuilderStore((s) => s.zoomLevel);
  const setZoomLevel = useSessionBuilderStore((s) => s.setZoomLevel);

  const sessions = useSessionBuilderStore((s) => s.sessions);

  // Extract unique dates from sessions
  const availableDates = useMemo(() => {
    const dates = new Set<string>();
    sessions.forEach((s) => {
      if (s.start_time) {
        dates.add(s.start_time.split("T")[0]);
      }
    });
    return Array.from(dates).sort();
  }, [sessions]);

  const VIEW_MODES: { mode: ViewMode; icon: any; label: string }[] = [
    { mode: "kanban", icon: LayoutGrid, label: "Kanban" },
    { mode: "timeline", icon: GanttChart, label: "Timeline" },
    { mode: "list", icon: LayoutList, label: "List" },
    { mode: "calendar", icon: CalendarDays, label: "Calendar" },
  ];

  return (
    <div className="flex flex-col md:flex-row items-center justify-between gap-4 p-4 border-b border-default bg-background/80 backdrop-blur-md sticky top-0 z-30">
      {/* Left Group: View Mode Switcher + Search */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        {/* View Switcher */}
        <div className="flex bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl p-1 border border-default">
          {VIEW_MODES.map(({ mode, icon: Icon, label }) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all",
                viewMode === mode
                  ? "bg-[var(--pri)] text-black shadow-md font-black"
                  : "text-muted hover:text-[var(--text)]"
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {/* Time Scale Selector */}
        {viewMode === "timeline" && (
          <div className="flex items-center gap-1.5 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl px-3 py-1.5 border border-default text-[11px] font-bold text-muted">
            <Clock className="h-3.5 w-3.5 text-[var(--pri)]" />
            <select
              value={zoomLevel >= 1.8 ? "15" : zoomLevel >= 0.9 ? "30" : "60"}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "15") setZoomLevel(2);
                else if (val === "30") setZoomLevel(1);
                else setZoomLevel(0.5);
              }}
              className="bg-transparent text-[var(--text)] font-black outline-none cursor-pointer border-0 text-[11px]"
            >
              <option value="15" className="bg-zinc-950 text-white">15 min view</option>
              <option value="30" className="bg-zinc-950 text-white">30 min view</option>
              <option value="60" className="bg-zinc-950 text-white">60 min view</option>
            </select>
          </div>
        )}

        {/* Date Selector */}
        {availableDates.length > 0 && (
          <div className="flex items-center gap-1 bg-[color-mix(in_srgb,var(--text)_5%,transparent)] rounded-2xl px-3 py-1.5 border border-default text-[11px] font-bold text-muted">
            <CalendarIcon className="h-3.5 w-3.5 text-[var(--pri)]" />
            <select
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent text-[var(--text)] font-black outline-none cursor-pointer"
            >
              {availableDates.map((d) => (
                <option key={d} value={d} className="bg-zinc-950 text-white">
                  {d}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right Group: Undo/Redo + Conflicts + Save Status + New Session */}
      <div className="flex items-center gap-3 w-full md:w-auto justify-end">
        {/* Undo / Redo */}
        <div className="flex items-center gap-1 border-r border-default pr-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={undo}
            disabled={history.length === 0}
            className="h-8 w-8 rounded-xl"
            title="Undo (Ctrl+Z)"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={redo}
            disabled={future.length === 0}
            className="h-8 w-8 rounded-xl"
            title="Redo (Ctrl+Shift+Z)"
          >
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Conflicts Badge */}
        <button
          onClick={toggleConflictPanel}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-[11px] font-bold border transition-all",
            conflicts.length > 0
              ? "border-red-500/50 bg-red-500/10 text-red-400 hover:bg-red-500/20 animate-pulse"
              : "border-default text-muted hover:text-[var(--text)]"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          <span>{conflicts.length} Conflicts</span>
        </button>

        {/* Auto-Save Status */}
        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted px-2">
          {isSaving ? (
            <span className="flex items-center gap-1.5 text-[var(--pri)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving...
            </span>
          ) : isDirty ? (
            <span className="text-[var(--warn)] font-bold">Unsaved changes</span>
          ) : (
            <span className="flex items-center gap-1 text-[var(--success)]">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
        </div>

        {/* New Session Button */}
        {onNewSession && (
          <Button
            onClick={onNewSession}
            className="h-9 px-4 bg-[var(--pri)] hover:bg-[var(--sec)] text-black font-black text-[11px] uppercase tracking-wider rounded-2xl shadow-md border-0"
          >
            <Plus className="mr-1.5 h-4 w-4" /> Add Session
          </Button>
        )}
      </div>
    </div>
  );
}

