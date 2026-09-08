"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  Armchair,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Edit3,
  GripVertical,
  Layers3,
  MapPin,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDeleteRoom } from "@/hooks/useRooms";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { BuilderCreateRoomDialog } from "./BuilderCreateRoomDialog";
import { RegisterSpeakerDialog } from "../../speakers/RegisterSpeakerDialog";

type PaletteTab = "queue" | "rooms" | "speakers" | "services";

interface LeftPaletteProps {
  onNewSession?: () => void;
}

const serviceTemplates = [
  { id: "coffee", name: "Coffee break", category: "BREAK", minutes: 30, icon: Coffee },
  { id: "registration", name: "Registration", category: "REGISTRATION", minutes: 60, icon: Users },
  { id: "lunch", name: "Lunch break", category: "MEAL", minutes: 60, icon: Armchair },
  { id: "networking", name: "Networking", category: "NETWORKING", minutes: 45, icon: Sparkles },
];

export function LeftPalette({ onNewSession }: LeftPaletteProps) {
  const { eventId } = useParams();
  const eventIdStr = eventId as string;
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<PaletteTab>("queue");
  const [search, setSearch] = useState("");
  const [trackId, setTrackId] = useState<string>("all");
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [roomToEdit, setRoomToEdit] = useState<any | null>(null);
  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);

  const sessions = useSessionBuilderStore((state) => state.sessions);
  const rooms = useSessionBuilderStore((state) => state.rooms);
  const tracks = useSessionBuilderStore((state) => state.tracks);
  const unscheduledSpeakers = useSessionBuilderStore((state) => state.unscheduledSpeakers);
  const setSelectedSessionId = useSessionBuilderStore((state) => state.setSelectedSessionId);
  const moveSession = useSessionBuilderStore((state) => state.moveSession);
  const deleteRoomInStore = useSessionBuilderStore((state) => state.deleteRoom);
  const deleteRoom = useDeleteRoom();

  const unscheduledSessions = useMemo(() => {
    const query = search.trim().toLowerCase();
    return sessions.filter((session) => {
      if (session.room_id) return false;
      if (trackId !== "all" && session.track_id !== trackId) return false;
      if (!query) return true;
      return [session.name, session.session_code, session.track_name, session.speakers?.map((speaker) => speaker.full_name).join(" ")]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    });
  }, [search, sessions, trackId]);

  const tabs: Array<{ id: PaletteTab; label: string; icon: typeof Layers3; count?: number }> = [
    { id: "queue", label: "Queue", icon: Layers3, count: sessions.filter((session) => !session.room_id).length },
    { id: "rooms", label: "Rooms", icon: MapPin, count: rooms.length },
    { id: "speakers", label: "People", icon: Users, count: unscheduledSpeakers.length },
    { id: "services", label: "Blocks", icon: Coffee },
  ];

  const handleUnscheduledDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDropTarget(false);
    let sessionId = event.dataTransfer.getData("text/plain");
    try {
      const payload = JSON.parse(event.dataTransfer.getData("application/json"));
      sessionId = payload.sessionId || sessionId;
    } catch {
      // The text payload is the backwards-compatible builder drag format.
    }
    const session = sessions.find((item) => item.id === sessionId);
    if (session) moveSession(session.id, null, session.start_time, session.end_time);
  };

  if (isCollapsed) {
    return (
      <aside className="relative z-30 flex w-[52px] shrink-0 flex-col items-center border-r border-[var(--border-default)] bg-[var(--card)] py-3">
        <button type="button" onClick={() => setIsCollapsed(false)} className="mb-4 flex size-8 items-center justify-center rounded-lg border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]" aria-label="Expand workspace panel">
          <ChevronRight className="size-4" />
        </button>
        <div className="flex flex-col gap-2">
          {tabs.map(({ id, label, icon: Icon, count }) => (
            <button
              key={id}
              type="button"
              onClick={() => { setActiveTab(id); setIsCollapsed(false); }}
              className="relative flex size-9 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]"
              aria-label={`Open ${label}`}
            >
              <Icon className="size-4" />
              {count ? <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-[var(--pri)] px-1 text-center text-[9px] font-bold leading-4 text-[var(--primary-contrast)]">{count}</span> : null}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  return (
    <aside className="relative z-30 flex w-[304px] shrink-0 flex-col border-r border-[var(--border-default)] bg-[var(--card)] shadow-[8px_0_24px_rgba(15,23,42,0.035)]">
      <div className="flex h-[52px] items-center justify-between border-b border-[var(--border-subtle)] px-4">
        <div>
          <h2 className="text-xs font-bold text-[var(--text-primary)]">Workspace</h2>
          <p className="mt-0.5 text-[10px] text-[var(--text-tertiary)]">Drag items onto the programme</p>
        </div>
        <button type="button" onClick={() => setIsCollapsed(true)} className="flex size-8 items-center justify-center rounded-lg text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)]" aria-label="Collapse workspace panel">
          <ChevronLeft className="size-4" />
        </button>
      </div>

      <nav className="grid grid-cols-4 border-b border-[var(--border-subtle)] px-2" aria-label="Schedule resources">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setActiveTab(id)}
            className={cn(
              "relative flex h-[54px] flex-col items-center justify-center gap-1 text-[9px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--pri)]",
              activeTab === id ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
            )}
          >
            <span className="relative"><Icon className="size-4" />{count ? <span className="absolute -right-2.5 -top-2 min-w-3.5 rounded-full bg-[var(--surface-subtle)] px-1 text-[8px] leading-3.5">{count}</span> : null}</span>
            {label}
            {activeTab === id ? <span className="absolute inset-x-2 bottom-0 h-0.5 bg-[var(--pri)]" /> : null}
          </button>
        ))}
      </nav>

      {activeTab === "queue" ? (
        <>
          <div className="space-y-2.5 border-b border-[var(--border-subtle)] p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search waiting sessions"
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-subtle)] pl-8 pr-3 text-[11px] font-medium text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--pri)] focus:ring-2 focus:ring-[var(--pri)]/15"
              />
            </div>
            {tracks.length > 0 ? (
              <select value={trackId} onChange={(event) => setTrackId(event.target.value)} className="h-8 w-full rounded-lg border border-[var(--border-default)] bg-[var(--card)] px-2.5 text-[10px] font-semibold text-[var(--text-secondary)] outline-none focus:border-[var(--pri)]">
                <option value="all">All tracks</option>
                {tracks.map((track) => <option key={track.id} value={track.id}>{track.name}</option>)}
              </select>
            ) : null}
          </div>

          <div
            className={cn("mx-3 mt-3 rounded-lg border border-dashed px-3 py-2 text-center text-[10px] font-semibold transition-colors", isDropTarget ? "border-[var(--pri)] bg-[var(--pri)]/8 text-[var(--pri)]" : "border-[var(--border-default)] text-[var(--text-tertiary)]")}
            onDragEnter={() => setIsDropTarget(true)}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setIsDropTarget(false); }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleUnscheduledDrop}
          >
            Drop here to remove a session from the schedule
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {unscheduledSessions.length ? unscheduledSessions.map((session) => (
              <article
                key={session.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/json", JSON.stringify({ type: "session", sessionId: session.id }));
                  event.dataTransfer.setData("text/plain", session.id);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => setSelectedSessionId(session.id)}
                className="group cursor-grab rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 shadow-[0_1px_3px_rgba(15,23,42,0.05)] transition-all hover:-translate-y-px hover:border-[var(--pri)]/45 hover:shadow-md active:cursor-grabbing"
                style={{ borderLeftWidth: 3, borderLeftColor: session.display_color || "#4F67D8" }}
              >
                <div className="flex items-start gap-2">
                  <GripVertical className="mt-0.5 size-3.5 shrink-0 text-[var(--text-tertiary)]/55" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{session.session_code} · {session.track_name || session.session_type}</p>
                    <h3 className="mt-1 line-clamp-2 text-[11px] font-bold leading-[1.35] text-[var(--text-primary)]">{session.name}</h3>
                    <p className="mt-1.5 truncate text-[9px] font-medium text-[var(--text-secondary)]">{session.speakers?.map((speaker) => speaker.full_name).join(", ") || "No speaker assigned"}</p>
                  </div>
                </div>
              </article>
            )) : (
              <div className="flex h-48 flex-col items-center justify-center px-5 text-center">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600"><Layers3 className="size-4" /></div>
                <p className="mt-3 text-xs font-bold text-[var(--text-primary)]">{search ? "No matching sessions" : "The queue is clear"}</p>
                <p className="mt-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">{search ? "Try another title, code, track or speaker." : "Every available session is placed in a room."}</p>
              </div>
            )}
          </div>

          <div className="border-t border-[var(--border-subtle)] p-3">
            <Button onClick={onNewSession} className="h-9 w-full gap-2 bg-[var(--text-primary)] text-xs font-bold text-[var(--card)] hover:opacity-90"><Plus className="size-3.5" /> Create session</Button>
          </div>
        </>
      ) : null}

      {activeTab === "rooms" ? (
        <>
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-3">
            <div><p className="text-[11px] font-bold text-[var(--text-primary)]">Programme rooms</p><p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">Each room becomes one schedule column</p></div>
            <Button variant="outline" size="sm" onClick={() => { setRoomToEdit(null); setIsCreateRoomOpen(true); }} className="h-8 gap-1.5 px-2.5 text-[10px] font-bold"><Plus className="size-3" /> Add</Button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {rooms.map((room, index) => (
              <div key={room.id} className="group rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold text-[var(--text-tertiary)]">ROOM {String(index + 1).padStart(2, "0")}</p>
                    <h3 className="mt-0.5 truncate text-xs font-bold text-[var(--text-primary)]">{room.name}</h3>
                    <p className="mt-1 text-[9px] font-medium text-[var(--text-secondary)]">{room.room_type} · {room.sessions_count || 0} sessions</p>
                  </div>
                  <div className="flex opacity-60 transition-opacity group-hover:opacity-100">
                    <button type="button" onClick={() => { setRoomToEdit(room); setIsCreateRoomOpen(true); }} className="flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--surface-subtle)] hover:text-[var(--pri)]" aria-label={`Edit ${room.name}`}><Edit3 className="size-3.5" /></button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Delete ${room.name}? Its sessions will return to the waiting queue.`)) return;
                        deleteRoom.mutate({ eventId: eventIdStr, roomId: room.id });
                        deleteRoomInStore(room.id);
                      }}
                      className="flex size-7 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-rose-500/10 hover:text-rose-500"
                      aria-label={`Delete ${room.name}`}
                    ><Trash2 className="size-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
            {!rooms.length ? <p className="py-12 text-center text-[11px] text-[var(--text-secondary)]">No rooms have been configured.</p> : null}
          </div>
        </>
      ) : null}

      {activeTab === "speakers" ? (
        <>
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-3 py-3">
            <div><p className="text-[11px] font-bold text-[var(--text-primary)]">Unassigned speakers</p><p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">Drop a speaker onto a session card</p></div>
            <Button variant="outline" size="sm" onClick={() => setIsCreateSpeakerOpen(true)} className="h-8 gap-1.5 px-2.5 text-[10px] font-bold"><Plus className="size-3" /> Add</Button>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {unscheduledSpeakers.map((speaker) => (
              <div
                key={speaker.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData("application/json", JSON.stringify({ type: "speaker", data: speaker }));
                  event.dataTransfer.effectAllowed = "copy";
                }}
                className="flex cursor-grab items-center gap-2.5 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-2.5 hover:border-[var(--pri)]/45 active:cursor-grabbing"
              >
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[10px] font-bold text-[var(--text-primary)]">{speaker.full_name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</div>
                <div className="min-w-0"><p className="truncate text-[11px] font-bold text-[var(--text-primary)]">{speaker.full_name}</p><p className="truncate text-[9px] text-[var(--text-secondary)]">{speaker.email}</p></div>
              </div>
            ))}
            {!unscheduledSpeakers.length ? <p className="py-12 text-center text-[11px] text-[var(--text-secondary)]">No unassigned speakers remain.</p> : null}
          </div>
        </>
      ) : null}

      {activeTab === "services" ? (
        <>
          <div className="border-b border-[var(--border-subtle)] px-3 py-3"><p className="text-[11px] font-bold text-[var(--text-primary)]">Service blocks</p><p className="mt-0.5 text-[9px] text-[var(--text-tertiary)]">Drag onto a room, then confirm its details</p></div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {serviceTemplates.map((template) => {
              const Icon = template.icon;
              return (
                <div
                  key={template.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("application/json", JSON.stringify({ type: "template", template }));
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                  className="group flex cursor-grab items-center gap-3 rounded-lg border border-[var(--border-default)] bg-[var(--card)] p-3 transition-all hover:-translate-y-px hover:border-amber-500/45 hover:shadow-sm active:cursor-grabbing"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400"><Icon className="size-4" /></div>
                  <div className="min-w-0 flex-1"><p className="text-[11px] font-bold text-[var(--text-primary)]">{template.name}</p><p className="mt-0.5 text-[9px] font-medium text-[var(--text-secondary)]">Default {template.minutes} minutes</p></div>
                  <GripVertical className="size-3.5 text-[var(--text-tertiary)]/55" />
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <BuilderCreateRoomDialog isOpen={isCreateRoomOpen} onClose={() => { setIsCreateRoomOpen(false); setRoomToEdit(null); }} roomToEdit={roomToEdit} />
      <RegisterSpeakerDialog isOpen={isCreateSpeakerOpen} onClose={() => setIsCreateSpeakerOpen(false)} eventId={eventIdStr} />
    </aside>
  );
}
