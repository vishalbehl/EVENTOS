"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
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
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-3 text-muted">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--pri)]" />
        <span className="font-bold text-[13px]">Loading Session Builder workspace...</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-center p-6">
        <h3 className="font-black text-[18px] text-[var(--text)] mb-2">Failed to load session builder</h3>
        <p className="text-[13px] text-muted mb-4">An error occurred while loading the event schedule data.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-100px)] overflow-hidden bg-background">
      {/* Top Toolbar */}
      <BuilderToolbar onNewSession={() => setCreateOpen(true)} />

      {/* Main Workspace Layout: Palette on Left + Canvas on Right */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Drag Palette */}
        <LeftPalette />

        {/* Canvas Area */}
        <main className="flex-1 overflow-auto p-6 bg-[color-mix(in_srgb,var(--text)_1%,transparent)]">
          {viewMode === "kanban" && (
            <KanbanView onAddSessionForRoom={handleOpenCreateForRoom} />
          )}

          {viewMode === "timeline" && <TimelineBuilderView />}

          {viewMode === "list" && (
            <div className="bg-background rounded-3xl p-6 border border-default shadow-sm">
              <SessionTable
                sessions={sessions as any}
                onSelectSession={(id: string) => setSelectedSessionId(id)}
              />
            </div>
          )}

          {viewMode === "calendar" && (
            <div className="bg-background rounded-3xl p-6 border border-default shadow-sm">
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
