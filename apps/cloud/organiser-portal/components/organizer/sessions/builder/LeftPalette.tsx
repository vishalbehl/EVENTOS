"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Calendar, Users, MapPin, Copy, ChevronLeft, ChevronRight, Plus, Edit, Trash } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSessionBuilderStore } from "@/store/useSessionBuilderStore";
import { useAssignSpeakerToSession } from "@/hooks/useSessionBuilder";

import { useDeleteRoom } from "@/hooks/useRooms";
import { useUpdateSpeaker, useDeleteSpeaker } from "@/hooks/useSpeakers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BuilderCreateRoomDialog } from "./BuilderCreateRoomDialog";
import { RegisterSpeakerDialog } from "../../speakers/RegisterSpeakerDialog";
import { CreateSessionDialog } from "../CreateSessionDialog";
import { SessionDetailDialog } from "../SessionDetailDialog";
import { useDeleteSession } from "@/hooks/useSessions";

export function LeftPalette() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState<"rooms" | "unscheduled" | "speakers" | "templates">("rooms");
  const [isCreateRoomOpen, setIsCreateRoomOpen] = useState(false);
  const [roomToEdit, setRoomToEdit] = useState<any | null>(null);
  const [isCreateSpeakerOpen, setIsCreateSpeakerOpen] = useState(false);
  const [isCreateSessionOpen, setIsCreateSessionOpen] = useState(false);
  const [sessionToEditId, setSessionToEditId] = useState<string | null>(null);

  const { eventId } = useParams() || {};
  const eventIdStr = eventId as string;
  const deleteRoom = useDeleteRoom();
  const updateSpeaker = useUpdateSpeaker(eventIdStr);
  const deleteSpeaker = useDeleteSpeaker(eventIdStr);
  const deleteSession = useDeleteSession(eventIdStr);
  const updateSpeakerInStore = useSessionBuilderStore((s) => s.updateSpeaker);
  const deleteSpeakerInStore = useSessionBuilderStore((s) => s.deleteSpeaker);
  const deleteRoomInStore = useSessionBuilderStore((s) => s.deleteRoom);
  const deleteSessionInStore = useSessionBuilderStore((s) => s.deleteSession);

  const unscheduledSpeakers = useSessionBuilderStore((s) => s.unscheduledSpeakers);
  const sessions = useSessionBuilderStore((s) => s.sessions);
  const rooms = useSessionBuilderStore((s) => s.rooms);
  const { mutate: assignSpeaker } = useAssignSpeakerToSession(eventIdStr);
  const selectedSessionId = useSessionBuilderStore((s) => s.selectedSessionId);

  const unscheduledSessions = sessions.filter((s) => !s.room_id);

  const handleDragStart = (e: React.DragEvent, sessionId: string) => {
    e.dataTransfer.setData("text/plain", sessionId);
    e.dataTransfer.effectAllowed = "move";
  };

  if (isCollapsed) {
    return (
      <div className="flex flex-col items-center py-3 px-1.5 border-r border-[var(--border-default)] bg-[var(--card)] w-12 transition-all z-40 relative">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(false)}
          className="h-7 w-7 rounded-md mb-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
          title="Expand Palette"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="flex flex-col gap-2 text-[var(--text-secondary)]">
          <button
            onClick={() => { setIsCollapsed(false); setActiveTab("unscheduled"); }}
            className="p-2 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] rounded-md relative transition-colors"
            title="Unscheduled Sessions"
          >
            <Calendar className="h-4 w-4" />
            {unscheduledSessions.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-0.5 rounded-full bg-[var(--pri)] text-[9px] font-bold text-black flex items-center justify-center">
                {unscheduledSessions.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setIsCollapsed(false); setActiveTab("speakers"); }}
            className="p-2 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] rounded-md relative transition-colors"
            title="Unassigned Speakers"
          >
            <Users className="h-4 w-4" />
            {unscheduledSpeakers.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 h-3.5 min-w-[14px] px-0.5 rounded-full bg-cyan-400 text-[9px] font-bold text-black flex items-center justify-center">
                {unscheduledSpeakers.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setIsCollapsed(false); setActiveTab("rooms"); }}
            className="p-2 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] rounded-md transition-colors"
            title="Rooms"
          >
            <MapPin className="h-4 w-4" />
          </button>
          <button
            onClick={() => { setIsCollapsed(false); setActiveTab("templates"); }}
            className="p-2 hover:bg-[var(--surface-subtle)] hover:text-[var(--text-primary)] rounded-md transition-colors"
            title="Templates"
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <aside className="w-72 sm:w-80 flex flex-col border-r border-[var(--border-default)] bg-[var(--card)] h-[calc(100vh-130px)] transition-all z-40 relative">
      {/* Header */}
      <div className="px-3.5 py-2.5 border-b border-[var(--border-default)] flex items-center justify-between">
        <h3 className="font-semibold text-xs text-[var(--text-primary)] tracking-wide uppercase">
          Builder <span className="text-[var(--pri)]">Palette</span>
        </h3>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setIsCollapsed(true)}
          className="h-6 w-6 rounded-md text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 p-1 bg-[var(--surface-subtle)] gap-1 border-b border-[var(--border-default)] text-[11px] font-medium">
        <button
          onClick={() => setActiveTab("rooms")}
          className={cn(
            "py-1.5 rounded-md text-center flex flex-col items-center gap-0.5 transition-all",
            activeTab === "rooms"
              ? "bg-[var(--card)] text-[var(--pri)] shadow-xs font-semibold"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <MapPin className="h-3.5 w-3.5" />
          <span>Rooms</span>
        </button>
        <button
          onClick={() => setActiveTab("unscheduled")}
          className={cn(
            "py-1.5 rounded-md text-center flex flex-col items-center gap-0.5 transition-all relative",
            activeTab === "unscheduled"
              ? "bg-[var(--card)] text-[var(--pri)] shadow-xs font-semibold"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Calendar className="h-3.5 w-3.5" />
          <span>Sessions</span>
        </button>
        <button
          onClick={() => setActiveTab("speakers")}
          className={cn(
            "py-1.5 rounded-md text-center flex flex-col items-center gap-0.5 transition-all",
            activeTab === "speakers"
              ? "bg-[var(--card)] text-[var(--pri)] shadow-xs font-semibold"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Speakers</span>
        </button>
        <button
          onClick={() => setActiveTab("templates")}
          className={cn(
            "py-1.5 rounded-md text-center flex flex-col items-center gap-0.5 transition-all",
            activeTab === "templates"
              ? "bg-[var(--card)] text-[var(--pri)] shadow-xs font-semibold"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          <Copy className="h-3.5 w-3.5" />
          <span>Snippets</span>
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5">
        {activeTab === "unscheduled" && (
          <>
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[11px] text-[var(--text-secondary)] font-medium">
                Drag to schedule:
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 rounded-md font-semibold border-[var(--border-default)]"
                onClick={() => setIsCreateSessionOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {unscheduledSessions.length > 0 ? (
              unscheduledSessions.map((session) => (
                <div
                  key={session.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, session.id)}
                  className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--pri)]/60 hover:bg-[var(--card)] transition-all flex flex-col gap-1.5 cursor-grab active:cursor-grabbing group shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex gap-1.5 items-center">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--pri)] bg-[var(--pri)]/10 px-1.5 py-0.5 rounded">
                        {session.session_code?.toUpperCase()}
                      </span>
                      <Badge variant="outline" className="text-[9px] font-semibold uppercase border-[var(--border-subtle)] px-1.5 py-0">
                        {session.session_type}
                      </Badge>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setSessionToEditId(session.id)}
                        className="text-[var(--text-secondary)] hover:text-[var(--pri)] p-1"
                        title="Edit Session"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Are you sure you want to delete this session?")) {
                            deleteSession.mutate(session.id);
                            deleteSessionInStore(session.id);
                          }
                        }}
                        className="text-[var(--text-secondary)] hover:text-rose-400 p-1"
                        title="Delete Session"
                      >
                        <Trash className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <h5 className="font-semibold text-xs text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--pri)] transition-colors">
                    {session.name}
                  </h5>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-[var(--text-tertiary)] text-xs italic">
                All sessions have room allocations.
              </div>
            )}
          </>
        )}

        {activeTab === "speakers" && (
          <>
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[11px] text-[var(--text-secondary)] font-medium">
                Unassigned speakers:
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 rounded-md font-semibold border-[var(--border-default)]"
                onClick={() => setIsCreateSpeakerOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {unscheduledSpeakers.length > 0 ? (
              unscheduledSpeakers.map((spk) => (
                <div
                  key={spk.id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("application/json", JSON.stringify({ type: "speaker", data: spk }));
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => {
                    if (selectedSessionId) assignSpeaker({ sessionId: selectedSessionId, speaker: spk });
                  }}
                  className={cn(
                    "p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--pri)]/60 hover:bg-[var(--card)] transition-all flex flex-col gap-2 cursor-pointer group shadow-xs",
                    !selectedSessionId && "opacity-85"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-[var(--brand-primary-muted)] text-[var(--brand-primary)] font-bold flex items-center justify-center text-xs">
                        {spk.full_name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-[var(--pri)] transition-colors">
                          {spk.full_name}
                        </div>
                        <div className="text-[10px] text-[var(--text-secondary)] truncate max-w-[130px]">
                          {spk.email}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const newName = window.prompt("Enter new name for speaker", spk.full_name);
                          if (newName && newName.trim()) {
                            const parts = newName.trim().split(" ");
                            const fn = parts[0];
                            const ln = parts.slice(1).join(" ");
                            updateSpeaker.mutate({ speakerId: spk.id, data: { first_name: fn, last_name: ln } });
                            updateSpeakerInStore(spk.id, { full_name: newName.trim() });
                          }
                        }}
                        className="text-[var(--text-secondary)] hover:text-[var(--pri)] p-1"
                        title="Edit Speaker"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm("Are you sure you want to delete this speaker?")) {
                            deleteSpeaker.mutate(spk.id);
                            deleteSpeakerInStore(spk.id);
                          }
                        }}
                        className="text-[var(--text-secondary)] hover:text-rose-400 p-1"
                        title="Delete Speaker"
                      >
                        <Trash className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!selectedSessionId}
                    className="h-6 text-[10px] font-semibold rounded-md px-2 w-full border-[var(--border-default)]"
                  >
                    Assign to Selected Session
                  </Button>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-[var(--text-tertiary)] text-xs italic">
                No unassigned speakers remaining.
              </div>
            )}
          </>
        )}

        {activeTab === "rooms" && (
          <>
            <div className="flex items-center justify-between mb-1">
              <div className="text-[11px] text-[var(--text-secondary)] font-medium">
                Available Rooms:
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px] px-2 rounded-md font-semibold border-[var(--border-default)]"
                onClick={() => setIsCreateRoomOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" /> Add Room
              </Button>
            </div>
            {rooms.map((room) => (
              <div
                key={room.id}
                className="p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--border-default)] hover:bg-[var(--card)] transition-all flex flex-col gap-1 shadow-xs group"
              >
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-xs text-[var(--text-primary)]">{room.name}</div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setRoomToEdit(room);
                        setIsCreateRoomOpen(true);
                      }}
                      className="text-[var(--text-secondary)] hover:text-[var(--pri)] p-1"
                      title="Edit Room"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this room?")) {
                          deleteRoom.mutate({ eventId: eventIdStr, roomId: room.id });
                          deleteRoomInStore(room.id);
                        }
                      }}
                      className="text-[var(--text-secondary)] hover:text-rose-400 p-1"
                      title="Delete Room"
                    >
                      <Trash className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="text-[10px] text-[var(--text-secondary)] flex justify-between">
                  <span>{room.room_type}</span>
                  {room.code && <span className="font-mono font-medium">{room.code}</span>}
                </div>
              </div>
            ))}
          </>
        )}

        {activeTab === "templates" && (
          <>
            <div className="text-[11px] text-[var(--text-secondary)] font-medium mb-1">
              Drag snippets into schedule:
            </div>
            {[
              { id: "TEMPLATE_BREAK", name: "Coffee Break", type: "BREAK", mins: 30 },
              { id: "TEMPLATE_REGISTRATION", name: "Registration", type: "REGISTRATION", mins: 60 },
              { id: "TEMPLATE_LUNCH", name: "Lunch Break", type: "MEAL", mins: 60 },
              { id: "TEMPLATE_NETWORKING", name: "Networking Session", type: "NETWORKING", mins: 45 },
            ].map((t) => (
              <div
                key={t.id}
                draggable
                onDragStart={(e) => handleDragStart(e, t.id)}
                className="w-full text-left p-2.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-subtle)] hover:border-[var(--pri)]/60 hover:text-[var(--pri)] transition-all flex items-center justify-between group shadow-xs cursor-grab active:cursor-grabbing"
              >
                <span className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-[var(--pri)]">{t.name}</span>
                <span className="text-[10px] text-[var(--text-secondary)] font-medium">{t.mins}m</span>
              </div>
            ))}
          </>
        )}
      </div>

      <BuilderCreateRoomDialog
        isOpen={isCreateRoomOpen}
        onClose={() => { setIsCreateRoomOpen(false); setRoomToEdit(null); }}
        roomToEdit={roomToEdit}
      />

      <RegisterSpeakerDialog
        isOpen={isCreateSpeakerOpen}
        onClose={() => setIsCreateSpeakerOpen(false)}
        eventId={eventIdStr}
      />

      <CreateSessionDialog
        isOpen={isCreateSessionOpen}
        onClose={() => setIsCreateSessionOpen(false)}
        eventId={eventIdStr}
        preloadedRooms={rooms}
      />

      {sessionToEditId && (
        <SessionDetailDialog
          isOpen={!!sessionToEditId}
          onClose={() => setSessionToEditId(null)}
          sessionId={sessionToEditId}
          eventId={eventIdStr}
        />
      )}
    </aside>
  );
}
