"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useSessionBuilderSnapshot, useAutoSaveSessionBuilder } from "@/hooks/useSessionBuilder";
import { LeftPalette } from "./LeftPalette";
import { BuilderToolbar } from "./BuilderToolbar";
import { KanbanView } from "./KanbanView";
import { TimelineBuilderView, type ScheduleTemplatePlacement } from "./TimelineBuilderView";
import { ConflictPanel } from "./ConflictPanel";
import { SessionQuickEditPanel } from "./SessionQuickEditPanel";
import { CreateSessionDialog } from "../CreateSessionDialog";
import { CalendarView } from "../CalendarView";
import { SessionTable } from "../SessionTable";

export function SessionBuilderPage() {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;

  const viewMode = useSessionBuilderStore((s) => s.viewMode);
  const setSelectedSessionId = useSessionBuilderStore((s) => s.setSelectedSessionId);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const eventTimezone = useSessionBuilderStore((s) => s.eventTimezone);

  const [createOpen, setCreateOpen] = useState(false);
  const [createInitialValues, setCreateInitialValues] = useState<{
    name?: string;
    room_id?: string;
    start_time?: string;
    end_time?: string;
    category?: string;
  } | null>(null);

  // Initialize data snapshot & auto-save
  const { isLoading, isError, refetch } = useSessionBuilderSnapshot(eventIdStr);
  useAutoSaveSessionBuilder(eventIdStr);

  const handleOpenCreateForRoom = (roomId: string) => {
    setCreateInitialValues({ room_id: roomId });
    setCreateOpen(true);
  };

  const handleCreateTemplate = (placement: ScheduleTemplatePlacement) => {
    setCreateInitialValues({
      name: placement.name,
      category: placement.category,
      room_id: placement.roomId,
      start_time: placement.startTime,
      end_time: placement.endTime,
    });
    setCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[520px] flex-col items-center justify-center gap-3 bg-[var(--background)] text-[var(--text-secondary)]">
        <div className="flex size-12 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--card)] shadow-sm">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--pri)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--text-primary)]">Preparing the programme desk</p>
          <p className="mt-1 text-xs">Loading rooms, sessions, speakers and schedule checks.</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex min-h-[460px] flex-col items-center justify-center bg-[var(--background)] p-6 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-500">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="mb-1 text-base font-semibold text-[var(--text-primary)]">The programme could not be loaded</h3>
        <p className="mb-4 max-w-md text-xs text-[var(--text-secondary)]">The schedule source is unavailable. Your existing programme has not been changed.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--pri)] px-4 text-xs font-bold text-[var(--primary-contrast)] shadow-sm transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pri)]"
        >
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-78px)] min-h-[680px] flex-col overflow-hidden bg-[var(--background)]">
      <BuilderToolbar onNewSession={() => { setCreateInitialValues(null); setCreateOpen(true); }} />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <LeftPalette onNewSession={() => { setCreateInitialValues(null); setCreateOpen(true); }} />

        <main className="min-w-0 flex-1 overflow-auto bg-[var(--surface-subtle)]/45">
          {viewMode === "kanban" && (
            <div className="p-4 sm:p-6"><KanbanView onAddSessionForRoom={handleOpenCreateForRoom} /></div>
          )}

          {viewMode === "timeline" && <TimelineBuilderView onCreateTemplate={handleCreateTemplate} />}

          {viewMode === "list" && (
            <div className="m-4 rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm sm:m-6">
              <SessionTable
                sessions={sessions as any}
                onSelectSession={(id: string) => setSelectedSessionId(id)}
              />
            </div>
          )}

          {viewMode === "calendar" && (
            <div className="m-4 rounded-xl border border-[var(--border-default)] bg-[var(--card)] p-5 shadow-sm sm:m-6">
              <CalendarView
                sessions={sessions as any}
                timezone={eventTimezone}
                onSelectSession={(id) => setSelectedSessionId(id)}
              />
            </div>
          )}
        </main>
      </div>

      <ConflictPanel />
      <SessionQuickEditPanel eventId={eventIdStr} />

      <CreateSessionDialog
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setCreateInitialValues(null);
        }}
        eventId={eventIdStr}
        preloadedRooms={rooms}
        initialValues={createInitialValues}
      />
    </div>
  );
}
