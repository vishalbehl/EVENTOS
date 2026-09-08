"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Clock3, GripVertical, MapPin, Plus, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useSessionBuilderStore,
  type BuilderSession,
  type SchedulingConflict,
} from "@/store/useSessionBuilderStore";

export interface ScheduleTemplatePlacement {
  name: string;
  category: string;
  roomId: string;
  startTime: string;
  endTime: string;
}

interface TimelineBuilderViewProps {
  onCreateTemplate?: (placement: ScheduleTemplatePlacement) => void;
}

const GUTTER_WIDTH = 68;
const ROOM_WIDTH = 248;
const BASE_HALF_HOUR_HEIGHT = 48;
const DEFAULT_START_MINUTES = 8 * 60;
const DEFAULT_END_MINUTES = 19 * 60;

function dateOnly(value: string) {
  return value.split("T")[0]?.split(" ")[0];
}

function minutesFromDateTime(value: string) {
  const match = value.match(/[T ](\d{2}):(\d{2})/);
  if (match) return Number(match[1]) * 60 + Number(match[2]);
  const parsed = new Date(value);
  return parsed.getHours() * 60 + parsed.getMinutes();
}

function scheduleDateTime(date: string, minutes: number, reference?: string) {
  const bounded = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutes)));
  const hours = Math.floor(bounded / 60).toString().padStart(2, "0");
  const mins = (bounded % 60).toString().padStart(2, "0");
  const suffix = reference?.match(/(Z|[+-]\d{2}:\d{2})$/)?.[1] || "";
  return `${date}T${hours}:${mins}:00${suffix}`;
}

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  const date = new Date(2026, 0, 1, hours, mins);
  return format(date, "h:mm a");
}

function sessionDuration(session: BuilderSession) {
  return Math.max(15, minutesFromDateTime(session.end_time) - minutesFromDateTime(session.start_time));
}

interface TimelineSessionProps {
  session: BuilderSession;
  conflicts: SchedulingConflict[];
  dayStart: number;
  pixelsPerMinute: number;
}

function TimelineSession({ session, conflicts, dayStart, pixelsPerMinute }: TimelineSessionProps) {
  const selectedSessionId = useSessionBuilderStore((state) => state.selectedSessionId);
  const setSelectedSessionId = useSessionBuilderStore((state) => state.setSelectedSessionId);
  const updateSession = useSessionBuilderStore((state) => state.updateSession);
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const [resizeStart, setResizeStart] = useState<{ pointerY: number; duration: number } | null>(null);

  const duration = previewDuration ?? sessionDuration(session);
  const startMinutes = minutesFromDateTime(session.start_time);
  const top = (startMinutes - dayStart) * pixelsPerMinute;
  const height = Math.max(44, duration * pixelsPerMinute - 4);
  const sessionConflicts = conflicts.filter((conflict) => conflict.session_ids.includes(session.id));
  const hasError = sessionConflicts.some((conflict) => conflict.severity === "error");
  const hasWarning = sessionConflicts.length > 0 && !hasError;
  const isService = ["BREAK", "MEAL", "REGISTRATION", "NETWORKING", "SERVICE"].includes(session.session_type);
  const accent = session.display_color || (isService ? "#C9822B" : "#4F67D8");

  useEffect(() => {
    if (!resizeStart) return;

    const handlePointerMove = (event: PointerEvent) => {
      const delta = Math.round((event.clientY - resizeStart.pointerY) / pixelsPerMinute / 15) * 15;
      setPreviewDuration(Math.max(15, resizeStart.duration + delta));
    };

    const handlePointerUp = (event: PointerEvent) => {
      const delta = Math.round((event.clientY - resizeStart.pointerY) / pixelsPerMinute / 15) * 15;
      const nextDuration = Math.max(15, resizeStart.duration + delta);
      const nextEnd = scheduleDateTime(dateOnly(session.start_time), startMinutes + nextDuration, session.end_time);
      setResizeStart(null);
      setPreviewDuration(null);
      if (nextDuration !== resizeStart.duration) updateSession(session.id, { end_time: nextEnd });
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [pixelsPerMinute, resizeStart, session.end_time, session.id, session.start_time, startMinutes, updateSession]);

  return (
    <article
      draggable={!resizeStart}
      onDragStart={(event) => {
        event.dataTransfer.setData("application/json", JSON.stringify({ type: "session", sessionId: session.id }));
        event.dataTransfer.setData("text/plain", session.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => setSelectedSessionId(session.id)}
      className={cn(
        "group absolute inset-x-1.5 z-10 overflow-hidden rounded-lg border bg-[var(--card)] px-2.5 py-2 text-left shadow-[0_2px_8px_rgba(15,23,42,0.08)] transition-[box-shadow,transform,border-color] hover:z-20 hover:-translate-y-px hover:shadow-[0_8px_22px_rgba(15,23,42,0.14)] focus-within:z-20",
        selectedSessionId === session.id && "z-30 ring-2 ring-[var(--pri)] ring-offset-1 ring-offset-[var(--background)]",
        hasError ? "border-rose-500/70" : hasWarning ? "border-amber-500/70" : "border-[var(--border-default)]",
      )}
      style={{
        top,
        height,
        borderLeftWidth: 4,
        borderLeftColor: accent,
        background: `color-mix(in srgb, ${accent} 7%, var(--card))`,
      }}
      title={`${session.name} · ${formatMinutes(startMinutes)}–${formatMinutes(startMinutes + duration)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
            {session.session_code} · {session.track_name || session.session_type}
          </p>
          <h3 className="mt-0.5 line-clamp-2 text-[11px] font-bold leading-[1.3] text-[var(--text-primary)]">{session.name}</h3>
        </div>
        {sessionConflicts.length ? <AlertTriangle className={cn("mt-0.5 size-3.5 shrink-0", hasError ? "text-rose-500" : "text-amber-500")} /> : null}
      </div>

      {height >= 66 ? (
        <div className="mt-1.5 flex items-center gap-2 text-[9px] font-semibold text-[var(--text-secondary)]">
          <span className="inline-flex items-center gap-1"><Clock3 className="size-3" /> {formatMinutes(startMinutes)} · {duration}m</span>
          {session.speaker_count ? <span className="inline-flex items-center gap-1"><Users className="size-3" /> {session.speaker_count}</span> : null}
        </div>
      ) : null}

      <button
        type="button"
        aria-label={`Resize ${session.name}`}
        onPointerDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setResizeStart({ pointerY: event.clientY, duration: sessionDuration(session) });
        }}
        className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-end justify-center opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
      >
        <span className="mb-0.5 h-0.5 w-8 rounded-full bg-[var(--text-tertiary)]/60" />
      </button>
    </article>
  );
}

export function TimelineBuilderView({ onCreateTemplate }: TimelineBuilderViewProps) {
  const sessions = useSessionBuilderStore((state) => state.sessions);
  const rooms = useSessionBuilderStore((state) => state.rooms);
  const selectedDate = useSessionBuilderStore((state) => state.selectedDate);
  const conflicts = useSessionBuilderStore((state) => state.conflicts);
  const zoomLevel = useSessionBuilderStore((state) => state.zoomLevel);
  const moveSession = useSessionBuilderStore((state) => state.moveSession);
  const [dragRoomId, setDragRoomId] = useState<string | null>(null);

  const daySessions = useMemo(
    () => sessions.filter((session) => dateOnly(session.start_time) === selectedDate && session.room_id),
    [selectedDate, sessions],
  );

  const bounds = useMemo(() => {
    let start = DEFAULT_START_MINUTES;
    let end = DEFAULT_END_MINUTES;
    daySessions.forEach((session) => {
      start = Math.min(start, Math.floor(minutesFromDateTime(session.start_time) / 60) * 60 - 30);
      end = Math.max(end, Math.ceil(minutesFromDateTime(session.end_time) / 60) * 60 + 30);
    });
    return { start: Math.max(0, start), end: Math.min(24 * 60, end) };
  }, [daySessions]);

  const pixelsPerMinute = (BASE_HALF_HOUR_HEIGHT * zoomLevel) / 30;
  const canvasHeight = (bounds.end - bounds.start) * pixelsPerMinute;
  const roomWidth = Math.round(ROOM_WIDTH * Math.max(0.9, Math.min(1.2, zoomLevel)));
  const timeLabels = useMemo(() => {
    const labels: number[] = [];
    for (let minute = bounds.start; minute <= bounds.end; minute += 30) labels.push(minute);
    return labels;
  }, [bounds.end, bounds.start]);

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, roomId: string) => {
    event.preventDefault();
    setDragRoomId(null);
    const rect = event.currentTarget.getBoundingClientRect();
    const rawMinutes = bounds.start + (event.clientY - rect.top) / pixelsPerMinute;
    const startMinutes = Math.max(bounds.start, Math.min(bounds.end - 15, Math.round(rawMinutes / 15) * 15));
    let payload: { type?: string; sessionId?: string; template?: { name: string; category: string; minutes: number } } = {};
    try {
      payload = JSON.parse(event.dataTransfer.getData("application/json"));
    } catch {
      payload = { type: "session", sessionId: event.dataTransfer.getData("text/plain") };
    }

    if (payload.type === "template" && payload.template && onCreateTemplate) {
      onCreateTemplate({
        name: payload.template.name,
        category: payload.template.category,
        roomId,
        startTime: scheduleDateTime(selectedDate, startMinutes),
        endTime: scheduleDateTime(selectedDate, startMinutes + payload.template.minutes),
      });
      return;
    }

    const session = sessions.find((item) => item.id === payload.sessionId);
    if (!session) return;
    const duration = sessionDuration(session);
    moveSession(
      session.id,
      roomId,
      scheduleDateTime(selectedDate, startMinutes, session.start_time),
      scheduleDateTime(selectedDate, startMinutes + duration, session.end_time),
    );
  };

  if (rooms.length === 0) {
    return (
      <div className="flex h-full min-h-[520px] items-center justify-center p-8">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-xl border border-[var(--border-default)] bg-[var(--card)] text-[var(--pri)] shadow-sm"><MapPin className="size-5" /></div>
          <h2 className="mt-4 text-base font-bold text-[var(--text-primary)]">Add the first room to start the schedule</h2>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Rooms define the programme columns. Add one from the workspace panel, then place sessions onto the timeline.</p>
        </div>
      </div>
    );
  }

  const isToday = selectedDate === format(new Date(), "yyyy-MM-dd");
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();

  return (
    <section className="h-full min-h-[520px] overflow-auto bg-[var(--surface-subtle)]/55" aria-label="Room schedule timeline">
      <div className="min-w-max" style={{ width: GUTTER_WIDTH + rooms.length * roomWidth }}>
        <div className="sticky top-0 z-30 flex h-[66px] border-b border-[var(--border-default)] bg-[var(--card)]/95 shadow-[0_4px_12px_rgba(15,23,42,0.05)] backdrop-blur">
          <div className="sticky left-0 z-40 flex shrink-0 items-end border-r border-[var(--border-default)] bg-[var(--card)] px-2 pb-2" style={{ width: GUTTER_WIDTH }}>
            <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Time</span>
          </div>
          {rooms.map((room, index) => {
            const count = daySessions.filter((session) => session.room_id === room.id).length;
            return (
              <div key={room.id} className="flex shrink-0 items-center justify-between gap-3 border-r border-[var(--border-default)] px-3" style={{ width: roomWidth }}>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-bold tabular-nums text-[var(--text-tertiary)]">{String(index + 1).padStart(2, "0")}</span>
                    <h2 className="truncate text-xs font-bold text-[var(--text-primary)]">{room.name}</h2>
                  </div>
                  <p className="mt-1 truncate text-[10px] font-medium text-[var(--text-secondary)]">{room.room_type} · {count} item{count === 1 ? "" : "s"}</p>
                </div>
                <GripVertical className="size-4 shrink-0 text-[var(--text-tertiary)]/55" aria-hidden="true" />
              </div>
            );
          })}
        </div>

        <div className="relative flex" style={{ height: canvasHeight }}>
          <div className="sticky left-0 z-20 shrink-0 border-r border-[var(--border-default)] bg-[var(--card)]" style={{ width: GUTTER_WIDTH, height: canvasHeight }}>
            {timeLabels.map((minute) => (
              <div
                key={minute}
                className={cn("absolute inset-x-0 pr-2 text-right text-[9px] font-semibold tabular-nums text-[var(--text-tertiary)]", minute !== bounds.start && "-translate-y-1/2")}
                style={{ top: minute === bounds.start ? 8 : (minute - bounds.start) * pixelsPerMinute }}
              >
                {minute % 60 === 0 ? formatMinutes(minute) : ":30"}
              </div>
            ))}
          </div>

          {rooms.map((room) => (
            <div
              key={room.id}
              aria-label={`${room.name} schedule column`}
              className={cn(
                "relative shrink-0 border-r border-[var(--border-default)] transition-colors",
                dragRoomId === room.id && "bg-[var(--pri)]/6",
              )}
              style={{
                width: roomWidth,
                height: canvasHeight,
                backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${BASE_HALF_HOUR_HEIGHT * zoomLevel - 1}px, color-mix(in srgb, var(--border-default) 72%, transparent) ${BASE_HALF_HOUR_HEIGHT * zoomLevel}px)`,
              }}
              onDragEnter={() => setDragRoomId(room.id)}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragRoomId(null);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => handleDrop(event, room.id)}
              onDoubleClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("article") || !onCreateTemplate) return;
                const rect = event.currentTarget.getBoundingClientRect();
                const rawMinutes = bounds.start + (event.clientY - rect.top) / pixelsPerMinute;
                const startMinutes = Math.max(bounds.start, Math.min(bounds.end - 30, Math.round(rawMinutes / 15) * 15));
                onCreateTemplate({
                  name: "",
                  category: "CONTENT",
                  roomId: room.id,
                  startTime: scheduleDateTime(selectedDate, startMinutes),
                  endTime: scheduleDateTime(selectedDate, startMinutes + 45),
                });
              }}
            >
              {dragRoomId === room.id ? (
                <div className="pointer-events-none absolute inset-x-2 top-3 z-20 flex h-10 items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--pri)] bg-[var(--card)]/90 text-[10px] font-bold text-[var(--pri)] shadow-sm">
                  <Plus className="size-3" /> Drop to place
                </div>
              ) : null}
              {daySessions
                .filter((session) => session.room_id === room.id)
                .map((session) => (
                  <TimelineSession key={session.id} session={session} conflicts={conflicts} dayStart={bounds.start} pixelsPerMinute={pixelsPerMinute} />
                ))}
            </div>
          ))}

          {isToday && nowMinutes >= bounds.start && nowMinutes <= bounds.end ? (
            <div className="pointer-events-none absolute z-20 h-px bg-rose-500" style={{ left: GUTTER_WIDTH, right: 0, top: (nowMinutes - bounds.start) * pixelsPerMinute }}>
              <span className="absolute -left-[58px] -top-2 rounded bg-rose-500 px-1.5 py-0.5 text-[8px] font-bold uppercase text-white">Now</span>
            </div>
          ) : null}
        </div>
      </div>

    </section>
  );
}
