"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MapPin, Users, Plus, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { BuilderRoom, BuilderSession } from "@/store/useSessionBuilderStore";
import { SessionCard } from "./SessionCard";
import { Button } from "@/components/ui/button";

interface RoomColumnProps {
  room: BuilderRoom;
  sessions: BuilderSession[];
  onAddSession?: (roomId: string) => void;
}

export function RoomColumn({ room, sessions, onAddSession }: RoomColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `room-${room.id}`,
    data: { type: "room", roomId: room.id },
  });

  const sessionIds = sessions.map((s) => s.id);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg bg-[var(--card)] border border-[var(--border-default)] p-3.5 min-w-[320px] max-w-[380px] flex-1 transition-all duration-150 shadow-xs",
        isOver && "border-[var(--pri)] bg-[var(--pri)]/5 ring-1 ring-[var(--pri)]/30"
      )}
    >
      {/* Room Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-[var(--border-subtle)]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm text-[var(--text-primary)] tracking-tight">
              {room.name}
            </h3>
            <span className="text-[10px] font-medium text-[var(--text-secondary)] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] px-1.5 py-0.5 rounded uppercase">
              {room.room_type}
            </span>
          </div>
          {(room.code || room.room_coordinator) && (
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-secondary)] mt-0.5">
              {room.code && (
                <span className="font-mono text-[10px] font-bold">
                  {room.code}
                </span>
              )}
              {room.room_coordinator && (
                <span className="truncate max-w-[140px] text-[10px]">
                  {room.room_coordinator}
                </span>
              )}
            </div>
          )}
        </div>

        <span className="text-xs font-semibold text-[var(--brand-primary)] bg-[var(--brand-primary-muted)] border border-[var(--brand-primary)]/20 px-2 py-0.5 rounded-full">
          {sessions.length}
        </span>
      </div>

      {/* Session Cards List */}
      <div className="flex-1 flex flex-col gap-2.5 min-h-[140px] overflow-y-auto max-h-[calc(100vh-270px)] pr-0.5">
        <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
          {sessions.length > 0 ? (
            sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))
          ) : (
            <div
              className={cn(
                "flex-1 flex flex-col items-center justify-center border border-dashed border-[var(--border-default)] rounded-lg p-5 text-center transition-all",
                isOver ? "border-[var(--pri)] bg-[var(--pri)]/10" : "hover:border-[var(--border-default)]"
              )}
            >
              <MapPin className="h-5 w-5 text-[var(--text-tertiary)] mb-1.5 opacity-60" />
              <p className="text-xs font-medium text-[var(--text-secondary)]">Drag session here</p>
              <p className="text-[10px] text-[var(--text-tertiary)]">or click below to create</p>
            </div>
          )}
        </SortableContext>
      </div>

      {/* Add Session Button */}
      {onAddSession && (
        <Button
          variant="ghost"
          onClick={() => onAddSession(room.id)}
          className="mt-2.5 w-full border border-dashed border-[var(--border-default)] hover:border-[var(--pri)] hover:bg-[var(--pri)]/5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--pri)]"
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Session
        </Button>
      )}
    </div>
  );
}
