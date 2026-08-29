"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  closestCorners,
} from "@dnd-kit/core";
import { useSessionBuilderStore, BuilderSession } from "@/store/useSessionBuilderStore";
import { RoomColumn } from "./RoomColumn";
import { SessionCard } from "./SessionCard";

interface KanbanViewProps {
  onAddSessionForRoom?: (roomId: string) => void;
}

export function KanbanView({ onAddSessionForRoom }: KanbanViewProps) {
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const selectedDate = useSessionBuilderStore((s) => s.selectedDate);
  const searchQuery = useSessionBuilderStore((s) => s.searchQuery);
  const trackFilter = useSessionBuilderStore((s) => s.trackFilter);
  const moveSession = useSessionBuilderStore((s) => s.moveSession);

  const [activeSession, setActiveSession] = useState<BuilderSession | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Filter sessions by selected date, search query, track filter
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      const matchesDate = !selectedDate || s.start_time.startsWith(selectedDate);
      const matchesSearch =
        !searchQuery ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.session_code.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTrack = !trackFilter || s.track_id === trackFilter;
      return matchesDate && matchesSearch && matchesTrack;
    });
  }, [sessions, selectedDate, searchQuery, trackFilter]);

  // Group sessions by room_id
  const sessionsByRoom = useMemo(() => {
    const map = new Map<string, BuilderSession[]>();

    rooms.forEach((r) => map.set(r.id, []));

    filteredSessions.forEach((s) => {
      const key = s.room_id || "unassigned";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });

    // Sort sessions in each column by start_time
    map.forEach((list) => {
      list.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    });

    return map;
  }, [filteredSessions, rooms]);

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const session = sessions.find((s) => s.id === active.id);
    if (session) setActiveSession(session);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveSession(null);

    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    const session = sessions.find((s) => s.id === activeId);
    if (!session) return;

    let targetRoomId: string | null = session.room_id;

    // Check if over target is a room column
    if (overId.startsWith("room-")) {
      targetRoomId = overId.replace("room-", "");
    } else {
      // Over another session -> get its room_id
      const targetSession = sessions.find((s) => s.id === overId);
      if (targetSession) {
        targetRoomId = targetSession.room_id;
      }
    }

    if (targetRoomId !== session.room_id) {
      const newStart = session.start_time;
      const newEnd = session.end_time;

      moveSession(session.id, targetRoomId === "unassigned" ? null : targetRoomId, newStart, newEnd);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 pt-1 items-start min-h-[calc(100vh-220px)]">
        {rooms.map((room) => (
          <RoomColumn
            key={room.id}
            room={room}
            sessions={sessionsByRoom.get(room.id) || []}
            onAddSession={onAddSessionForRoom}
          />
        ))}

        {/* Unassigned Room Column */}
        {(sessionsByRoom.get("unassigned") || []).length > 0 && (
          <RoomColumn
            room={{
              id: "unassigned",
              event_id: "",
              name: "Unassigned Sessions",
              screen_count: 0,
              room_type: "unassigned",
              is_active: true,
            }}
            sessions={sessionsByRoom.get("unassigned") || []}
          />
        )}
      </div>

      <DragOverlay>
        {activeSession ? <SessionCard session={activeSession} isDragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
