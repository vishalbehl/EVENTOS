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
        "flex flex-col rounded-xl bg-[color-mix(in_srgb,var(--text)_3%,transparent)] border border-default p-4 min-w-[300px] max-w-[360px] flex-1 transition-all duration-200",
        isOver && "border-[var(--pri)] bg-[var(--pri)]/5 ring-2 ring-[var(--pri)]/20 shadow-xl"
      )}
    >
      {/* Room Header */}
      <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-default">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-black text-[15px] text-[var(--text)] tracking-tight">
              {room.name}
            </h3>
            <span className="text-[10px] font-bold text-muted bg-[color-mix(in_srgb,var(--text)_10%,transparent)] px-2 py-0.5 rounded-full uppercase">
              {room.room_type}
            </span>
          </div>
          <div className="flex items-center gap-3 text-[11px] text-muted mt-0.5 font-medium">
            {room.capacity && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {room.capacity} seats
              </span>
            )}
            <span className="flex items-center gap-1">
              <Monitor className="h-3 w-3" /> {room.screen_count} screens
            </span>
          </div>
        </div>

        <span className="text-[11px] font-black text-[var(--pri)] bg-[var(--pri)]/10 border border-[var(--pri)]/20 px-2.5 py-1 rounded-full">
          {sessions.length}
        </span>
      </div>

      {/* Session Cards List */}
      <div className="flex-1 flex flex-col gap-3 min-h-[150px] overflow-y-auto max-h-[calc(100vh-280px)] pr-1">
        <SortableContext items={sessionIds} strategy={verticalListSortingStrategy}>
          {sessions.length > 0 ? (
            sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))
          ) : (
            <div
              className={cn(
                "flex-1 flex flex-col items-center justify-center border-2 border-dashed border-default/60 rounded-2xl p-6 text-center transition-all",
                isOver ? "border-[var(--pri)] bg-[var(--pri)]/10" : "hover:border-default"
              )}
            >
              <MapPin className="h-6 w-6 text-muted mb-2 opacity-50" />
              <p className="text-[12px] font-semibold text-muted">Drag session here</p>
              <p className="text-[10px] text-muted/70">or click below to add</p>
            </div>
          )}
        </SortableContext>
      </div>

      {/* Add Session Button */}
      {onAddSession && (
        <Button
          variant="ghost"
          onClick={() => onAddSession(room.id)}
          className="mt-3 w-full border border-dashed border-default hover:border-[var(--pri)] hover:bg-[var(--pri)]/10 rounded-xl text-[11px] font-bold text-muted hover:text-[var(--pri)]"
        >
          <Plus className="h-4 w-4 mr-1.5" /> Add Session
        </Button>
      )}
    </div>
  );
}
