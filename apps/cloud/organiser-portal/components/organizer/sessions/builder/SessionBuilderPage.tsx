"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useSessionBuilderSnapshot, useAutoSaveSessionBuilder } from "@/hooks/useSessionBuilder";
import { LeftPalette } from "./LeftPalette";
import { BuilderToolbar } from "./BuilderToolbar";
import { KanbanView } from "./KanbanView";
import { TimelineBuilderView } from "./TimelineBuilderView";
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
  const [selectedRoomIdForCreate, setSelectedRoomIdForCreate] = useState<string | null>(null);

  // Initialize data snapshot & auto-save
  const { isLoading, isError } = useSessionBuilderSnapshot(eventIdStr);
  useAutoSaveSessionBuilder(eventIdStr);

  const handleOpenCreateForRoom = (roomId: string) => {
    setSelectedRoomIdForCreate(roomId);
    setCreateOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[460px] gap-3 text-[var(--text-secondary)]">
        <Loader2 className="h-7 w-7 animate-spin text-[var(--pri)]" />
        <span className="font-semibold text-xs tracking-wide">Loading Session Builder workspace...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400 mb-3 border border-rose-500/20">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="font-semibold text-base text-[var(--text-primary)] mb-1">Failed to load session builder</h3>
        <p className="text-xs text-[var(--text-secondary)] mb-4 max-w-md">An error occurred while loading the event schedule data. Please check your connection and retry.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] overflow-hidden bg-[var(--background)]">
      {/* Top Toolbar */}
      <BuilderToolbar onNewSession={() => setCreateOpen(true)} />

      {/* Main Workspace Layout: Palette on Left + Canvas on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Drag Palette */}
        <LeftPalette />

        {/* Canvas Area */}
        <main className="flex-1 overflow-auto p-4 sm:p-5 bg-[var(--surface-subtle)]/50">
          {viewMode === "kanban" && (
            <KanbanView onAddSessionForRoom={handleOpenCreateForRoom} />
          )}

          {viewMode === "timeline" && <TimelineBuilderView />}

          {viewMode === "list" && (
            <div className="bg-[var(--card)] rounded-lg p-5 border border-[var(--border-default)] shadow-xs">
              <SessionTable
                sessions={sessions as any}
                onSelectSession={(id: string) => setSelectedSessionId(id)}
              />
            </div>
          )}

          {viewMode === "calendar" && (
            <div className="bg-[var(--card)] rounded-lg p-5 border border-[var(--border-default)] shadow-xs">
              <CalendarView
                sessions={sessions as any}
                timezone={eventTimezone}
                onSelectSession={(id) => setSelectedSessionId(id)}
              />
            </div>
          )}
        </main>
      </div>

      {/* Drawers / Modals */}
      <ConflictPanel />
      <SessionQuickEditPanel eventId={eventIdStr} />

      <CreateSessionDialog
        isOpen={createOpen}
        onClose={() => {
          setCreateOpen(false);
          setSelectedRoomIdForCreate(null);
        }}
        eventId={eventIdStr}
        preloadedRooms={rooms}
      />
    </div>
  );
}
